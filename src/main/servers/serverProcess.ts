import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { resolveJavaPath } from '../launch/launcher'
import { checkJavaCompat, detectJavaInstallations, findCompatibleJavaInstallation } from '../java/javaManager'
import { getServer, getServerRoot, markServerStarted, updateServerSettings } from './serverManager'
import { autoStartTunnelIfConfigured } from './playitTunnel'

// Server hosting is the first place in this codebase that spawns java
// directly instead of going through minecraft-launcher-core - MCLC only
// knows how to launch the *client* (auth, asset downloads, window options),
// and critically never hands back the real ChildProcess it spawns
// internally, so there was never a way to write to stdin or force-kill it.
// A hosted server needs both (console commands, a stop button), so this
// keeps the real handle around instead of wrapping it in another library.
const runningServers = new Map<string, ChildProcess>()

// Buffers each server's console output here in the main process, not just
// forwarded live to whichever renderer tab happens to be mounted - the
// Console tab's own React state was getting wiped every time its panel was
// closed/reopened (a remount) or the server stopped, even though the real
// server process (and its output) had nothing to do with whether a tab
// happened to be looking at it. Capped per-server so a very long-running
// server (across any number of stop/start cycles) can't grow this
// unboundedly; deliberately NOT cleared on start/stop - only an explicit
// "Clear log" action in the UI resets it, since the user's whole point was
// that closing the panel or stopping the server shouldn't lose the log.
const MAX_LOG_LINES = 2000
const serverLogBuffers = new Map<string, string[]>()

export function getServerLogBuffer(id: string): string[] {
  return serverLogBuffers.get(id) ?? []
}

export function clearServerLogBuffer(id: string): void {
  serverLogBuffers.set(id, [])
}

function appendToLogBuffer(id: string, line: string): void {
  const buffer = serverLogBuffers.get(id) ?? []
  buffer.push(line)
  if (buffer.length > MAX_LOG_LINES) buffer.splice(0, buffer.length - MAX_LOG_LINES)
  serverLogBuffers.set(id, buffer)
}

export function isServerRunning(id: string): boolean {
  return runningServers.has(id)
}

// Used by launcher.ts's "quit launcher when the game closes" option - that
// option must never actually quit while a hosted server is running, since
// the server is a direct child process of this same Electron main process
// and quitting takes it down too (killing a live world's connections/save
// with it), rather than the intended "close the launcher after playing".
export function isAnyServerRunning(): boolean {
  return runningServers.size > 0
}

function buildMemoryArgs(memoryMin: string, memoryMax: string): string[] {
  return [`-Xmx${memoryMax}`, `-Xms${memoryMin}`]
}

// Mojang's actual required-Java-version-per-Minecraft-version keeps moving
// (confirmed the hard way: the static mcVersion-based heuristic in
// javaManager.ts's requiredJavaMajorFor guessed Java 21 for a version that
// actually needed Java 25, since it still assumed the last known bump - the
// exact kind of drift that heuristic can't reliably keep up with). Rather
// than trying to hardcode Mojang's requirement again and risk it going
// stale the same way, this reacts to the JVM's OWN error, which always
// states the real number - "class file version 69.0" is unambiguously
// "needs Java 25" (Java's class-file-major = 44 + java major, a fixed JVM
// spec fact, not a guess). classFileVersion is the first captured group.
const UNSUPPORTED_CLASS_VERSION_PATTERN = /class file version (\d+)\.0.*?up to \d+\.0/
// Guards against retrying forever if even the auto-selected "better" Java
// still isn't enough (or none was found) - one retry per start attempt,
// cleared once a start attempt is no longer taking the retry path.
const javaRetryAttempted = new Set<string>()

export async function startServer(mainWindow: BrowserWindow, id: string): Promise<void> {
  const server = getServer(id)
  if (!server) throw new Error('Server nicht gefunden.')
  if (runningServers.has(id)) throw new Error('Dieser Server läuft bereits.')
  // playit.gg is one shared account-wide tunnel now (see playitTunnel.ts),
  // not one per server - it only ever points at a single local port, so at
  // most one hosted server can meaningfully be "the one behind the tunnel"
  // at a time. Enforcing that here (rather than just at the tunnel layer)
  // keeps the constraint simple and visible instead of letting a second
  // server start and silently not be reachable through it.
  const [runningId] = runningServers.keys()
  if (runningId) {
    const runningServer = getServer(runningId)
    throw new Error(
      `Es kann immer nur ein Server gleichzeitig laufen (der playit.gg-Tunnel wird geteilt) - "${runningServer?.name ?? runningId}" läuft bereits. Stoppe ihn zuerst.`
    )
  }
  if (!server.eulaAccepted) {
    throw new Error('Die Minecraft-EULA muss zuerst akzeptiert werden.')
  }

  const root = getServerRoot(id)
  let javaPath = await resolveJavaPath(server.javaPath)
  // Unlike a client Instance (which warns pre-launch and lets the crash
  // diagnosis offer a fix afterward), a hosted server has nothing
  // equivalent watching for this - it would otherwise crash-loop with a
  // cryptic UnsupportedClassVersionError from deep inside the Fabric/vanilla
  // bundler every single start. Auto-switching to a detected compatible
  // install here prevents the crash outright instead of just explaining it
  // after the fact.
  const compat = await checkJavaCompat(javaPath, server.mcVersion)
  if (compat.mismatch && compat.requiredMajor !== null) {
    const installations = await detectJavaInstallations()
    const better = findCompatibleJavaInstallation(installations, compat.requiredMajor)
    if (better) {
      javaPath = better.path
    } else {
      throw new Error(
        `Die verwendete Java-Version (${compat.installedVersion ?? 'unbekannt'}) ist zu alt für Minecraft ${server.mcVersion} (benötigt: Java ${compat.requiredMajor}) - keine passende Java-Installation gefunden. Bitte im General-Tab dieses Servers manuell eine neuere Java-Version auswählen.`
      )
    }
  }
  const jvmArgs = server.jvmArgs ? server.jvmArgs.split(/\s+/).filter(Boolean) : []
  const args = [
    ...buildMemoryArgs(server.memoryMin, server.memoryMax),
    ...jvmArgs,
    '-jar',
    'server.jar',
    'nogui'
  ]

  const child = spawn(javaPath, args, { cwd: root })
  runningServers.set(id, child)

  const send = (line: string): void => {
    appendToLogBuffer(id, line)
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('server:log', { serverId: id, line })
  }

  // Line-buffer stdout/stderr - spawn's data events don't respect line
  // boundaries (a single console.log from the server can arrive split
  // across multiple 'data' events, or several lines can arrive in one),
  // and a raw chunk-per-event feed would render badly in a line-oriented
  // console view.
  function makeLineBuffer(): (chunk: Buffer) => void {
    let buffer = ''
    return (chunk: Buffer) => {
      buffer += chunk.toString('utf-8')
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() ?? ''
      for (const line of lines) send(line)
    }
  }
  // All listeners (including 'error'/'close', which are what actually clean
  // up runningServers) are attached before anything else fallible runs
  // below - a failure in the fallible bookkeeping step must never leave a
  // tracked child with no listeners able to ever remove it from the map.
  child.stdout?.on('data', makeLineBuffer())
  child.stderr?.on('data', makeLineBuffer())
  // A write to stdin can race the process's own exit (e.g. a command sent
  // right as the server crashes) and hit an already-broken pipe - without a
  // listener here, that EPIPE surfaces as an unhandled stream 'error' and
  // crashes the whole main process instead of just failing this one write.
  child.stdin?.on('error', () => {
    // Swallowed deliberately: the 'close' handler below is the single
    // source of truth for "this server stopped" and always fires
    // regardless, so there's nothing more to do here than prevent the
    // unhandled-error crash.
  })

  child.on('close', (code) => {
    runningServers.delete(id)
    if (code !== 0 && !javaRetryAttempted.has(id)) {
      const logText = (serverLogBuffers.get(id) ?? []).join('\n')
      const versionMatch = UNSUPPORTED_CLASS_VERSION_PATTERN.exec(logText)
      if (versionMatch) {
        javaRetryAttempted.add(id)
        void retryWithCompatibleJava(mainWindow, id, Number(versionMatch[1]) - 44)
        return
      }
    }
    javaRetryAttempted.delete(id)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server:closed', { serverId: id, code: code ?? 0 })
    }
  })

  child.on('error', (err) => {
    runningServers.delete(id)
    send(`[Fehler] Prozess konnte nicht gestartet werden: ${err.message}`)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('server:closed', { serverId: id, code: -1 })
    }
  })

  // Persisting lastStarted is best-effort - if it throws (disk full, a
  // momentary file lock), the process is already running with working
  // listeners either way, so a bookkeeping failure here must not leave it
  // orphaned/untracked the way it would if this ran before the listeners
  // above were attached.
  try {
    markServerStarted(id)
  } catch (err) {
    send(`[Warnung] Startzeit konnte nicht gespeichert werden: ${err instanceof Error ? err.message : String(err)}`)
  }

  // Fire-and-forget: a tunnel failing to auto-start shouldn't fail the
  // server start itself (autoStartTunnelIfConfigured already reports its
  // own failure to the tunnel log rather than throwing past this point).
  void autoStartTunnelIfConfigured(mainWindow, id, server.serverPort)
}

// Reacts to a real UnsupportedClassVersionError instead of only trusting
// the pre-flight guess in startServer above (see the comment on
// UNSUPPORTED_CLASS_VERSION_PATTERN for why the guess alone isn't
// sufficient) - looks for an installed Java that's actually new enough
// (the real number, read off the crash itself), persists it as this
// server's Java so future starts don't need to retry again, and starts it
// for real. Falls back to one clear, accurate error if no such install
// exists locally.
async function retryWithCompatibleJava(
  mainWindow: BrowserWindow,
  id: string,
  requiredMajor: number
): Promise<void> {
  const send = (line: string): void => {
    appendToLogBuffer(id, line)
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('server:log', { serverId: id, line })
  }
  send(
    `[Auto-Fix] Die verwendete Java-Version ist zu alt für diesen Server (benötigt: Java ${requiredMajor}) - suche nach einer passenden Installation...`
  )
  const installations = await detectJavaInstallations()
  const better = findCompatibleJavaInstallation(installations, requiredMajor)
  if (!better) {
    javaRetryAttempted.delete(id)
    send(
      `[Fehler] Keine lokale Java-${requiredMajor}-Installation gefunden. Bitte Java ${requiredMajor} oder neuer installieren und im General-Tab dieses Servers auswählen.`
    )
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('server:closed', { serverId: id, code: -1 })
    return
  }
  send(`[Auto-Fix] Java ${better.version} gefunden (${better.path}) - starte den Server damit neu...`)
  try {
    updateServerSettings(id, { javaPath: better.path })
  } catch (err) {
    send(`[Warnung] Java-Pfad konnte nicht gespeichert werden: ${err instanceof Error ? err.message : String(err)}`)
  }
  try {
    await startServer(mainWindow, id)
  } catch (err) {
    javaRetryAttempted.delete(id)
    send(`[Fehler] Neustart fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('server:closed', { serverId: id, code: -1 })
  }
}

// "stop" already saves the world as part of its own shutdown sequence
// (kick players -> save -> exit), but sending an explicit "save-all" first
// gives that save a head start before stop's own sequence even begins -
// belt-and-suspenders insurance for a large world: if the force-kill
// timeout below ever has to fire because stop's graceful shutdown is
// taking too long, chunks have already been flushing to disk for longer
// than if save-all were never sent at all. A real Minecraft server can
// take several seconds to actually exit after "stop" (flushing chunks to
// disk), so this waits before falling back to a hard kill rather than
// risking corrupting an in-progress save by being impatient. The 'close'
// handler above still fires either way and cleans up runningServers.
export function stopServer(id: string): void {
  const child = runningServers.get(id)
  if (!child) return
  if (child.stdin && !child.stdin.destroyed) {
    child.stdin.write('save-all\n')
    setTimeout(() => {
      if (child.stdin && !child.stdin.destroyed) child.stdin.write('stop\n')
    }, 1000)
  } else {
    child.kill()
    return
  }
  setTimeout(() => {
    if (runningServers.has(id)) child.kill()
  }, 16000)
}

export function sendServerCommand(id: string, command: string): void {
  const child = runningServers.get(id)
  if (!child?.stdin || child.stdin.destroyed) throw new Error('Server läuft nicht.')
  child.stdin.write(`${command}\n`)
}

export function registerServerProcessHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('servers:hostStart', (_event, id: string) => startServer(mainWindow, id))
  ipcMain.handle('servers:hostStop', (_event, id: string) => stopServer(id))
  ipcMain.handle('servers:hostSendCommand', (_event, id: string, command: string) =>
    sendServerCommand(id, command)
  )
  ipcMain.handle('servers:hostIsRunning', (_event, id: string) => isServerRunning(id))
  ipcMain.handle('servers:hostGetLogBuffer', (_event, id: string) => getServerLogBuffer(id))
  ipcMain.handle('servers:hostClearLogBuffer', (_event, id: string) => clearServerLogBuffer(id))
}
