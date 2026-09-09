import { ipcMain, BrowserWindow } from 'electron'
import { spawn, ChildProcess } from 'child_process'
import { resolveJavaPath } from '../launch/launcher'
import { getServer, getServerRoot, markServerStarted } from './serverManager'
import { autoStartTunnelIfConfigured } from './playitTunnel'

// Server hosting is the first place in this codebase that spawns java
// directly instead of going through minecraft-launcher-core - MCLC only
// knows how to launch the *client* (auth, asset downloads, window options),
// and critically never hands back the real ChildProcess it spawns
// internally, so there was never a way to write to stdin or force-kill it.
// A hosted server needs both (console commands, a stop button), so this
// keeps the real handle around instead of wrapping it in another library.
const runningServers = new Map<string, ChildProcess>()

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
  const javaPath = await resolveJavaPath(server.javaPath)
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

// Sends the vanilla "stop" console command first, which triggers a graceful
// world save - a real Minecraft server can take several seconds to actually
// exit after that (flushing chunks to disk), so this waits before falling
// back to a hard kill rather than risking corrupting an in-progress save by
// being impatient. The 'close' handler above still fires either way and
// cleans up runningServers.
export function stopServer(id: string): void {
  const child = runningServers.get(id)
  if (!child) return
  if (child.stdin && !child.stdin.destroyed) {
    child.stdin.write('stop\n')
  } else {
    child.kill()
    return
  }
  setTimeout(() => {
    if (runningServers.has(id)) child.kill()
  }, 15000)
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
}
