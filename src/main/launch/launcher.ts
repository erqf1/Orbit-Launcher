import { ipcMain, BrowserWindow, app } from 'electron'
import { randomUUID } from 'crypto'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { Client } from 'minecraft-launcher-core'
import { getMclcAuthorization, getMclcAuthorizationFor } from '../auth/msmcAuth'
import { getInstance, getInstanceRoot, markLaunched, addPlaytime } from '../instances/instanceManager'
import { diagnoseCrash } from './crashDiagnosis'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// serverProcess.ts already imports resolveJavaPath from this module, so this
// module can't import back from serverProcess.ts (circular import) to ask
// "is a hosted server currently running" directly - same injected-callback
// pattern as serverManager.ts's setIsServerRunningCheck. index.ts wires the
// real check in once both modules are registered.
let isAnyServerRunningCheck: (() => boolean) | null = null

export function setIsAnyServerRunningCheck(check: () => boolean): void {
  isAnyServerRunningCheck = check
}

// Minecraft switched from LWJGL 2 to LWJGL 3 at 1.13. LWJGL 2 has no DPI
// awareness of its own and just trusts whatever pixel size Windows reports
// for the window - it expects to be left DPI-*un*aware so Windows bitmap-
// scales its whole framebuffer (blurry but intact). If the java(w).exe
// actually spawned is DPI-aware, LWJGL 2 gets handed real high-DPI pixel
// coordinates it never accounts for and only renders into the small area
// it still assumes is the whole window - the "tiny correctly-rendered
// patch, rest solid black" glitch.
//
// The obvious fix - the same per-exe Windows compatibility-shim registry
// flag Prism/MultiMC users are told to set on javaw.exe - turned out not to
// work here: modern JDK builds (JDK 9+, including the Liberica build this
// install uses) embed their own DPI-awareness manifest in java(w).exe, and
// an app's own manifest declaration takes precedence over that compat shim,
// silently making the registry flag a no-op. This JVM property instead
// tells the JVM itself, at startup before any window exists, to report
// itself DPI-unaware to Windows - taking effect regardless of the exe's own
// manifest, which the registry shim can't do.
function needsLegacyDpiWorkaround(mcVersion: string): boolean {
  const modern = mcVersion.match(/^1\.(\d+)/)
  if (modern) return Number(modern[1]) < 13
  // Classic/indev/infdev/alpha/beta version strings predate LWJGL 3 entirely;
  // anything else (e.g. a non-"1.x" version scheme) is assumed modern/LWJGL 3.
  return /^(rd-|inf-|c0\.|a1\.|b1\.)/i.test(mcVersion)
}

// instance.javaPath is null for "use the system default", in which case
// MCLC itself just spawns the bare `java` command. No longer used inside
// this file's own launch flow (the DPI workaround above works via a JVM
// property, not java's resolved absolute path) - kept exported for reuse by
// server hosting (serverProcess.ts), which spawns java directly via
// child_process rather than through MCLC and needs the same resolution.
export async function resolveJavaPath(explicitPath: string | null): Promise<string> {
  if (explicitPath) return explicitPath
  if (process.platform !== 'win32') return 'java'
  try {
    const { stdout } = await execFileAsync('where', ['java'])
    const first = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find((line) => line)
    return first ?? 'java'
  } catch {
    return 'java'
  }
}

// Different instances may run concurrently, but the same instance can't be
// launched twice - an earlier version allowed that too and real-world
// testing found it caused real problems (two processes sharing one
// instance's saves/logs/screenshots folder). closeOnLaunch can be set on
// more than one concurrently-running instance, so track *which* launches
// asked for the window hidden and only re-show once none of them still do.
const activeInstanceIds = new Set<string>()
const hideRequesters = new Set<string>()

// Buffers each launch's debug/data text (capped) purely so a non-zero exit
// can be scanned for known crash signatures (see crashDiagnosis.ts) - this
// is the same raw stream already forwarded live to the renderer's log pane,
// just also kept here long enough to analyze once the process exits.
// Cleared per-launchId right after diagnosis runs, so it never accumulates
// across launches.
const MAX_CRASH_LOG_LINES = 4000
const launchLogBuffers = new Map<string, string[]>()

function appendToLaunchLogBuffer(launchId: string, line: string): void {
  const buffer = launchLogBuffers.get(launchId) ?? []
  buffer.push(line)
  if (buffer.length > MAX_CRASH_LOG_LINES) buffer.splice(0, buffer.length - MAX_CRASH_LOG_LINES)
  launchLogBuffers.set(launchId, buffer)
}

// Set from a `--launch-instance=<id>` argv flag (added by desktop shortcuts,
// see instanceManager's createDesktopShortcut) and consumed once by the
// renderer after it restores auth on startup, so a shortcut-triggered launch
// goes through the exact same play flow as clicking "Play" instead of a
// separate main-process launch path.
let pendingLaunchInstanceId: string | null = null

export function setPendingLaunchInstanceIdFromArgv(argv: string[]): void {
  const flag = argv.find((arg) => arg.startsWith('--launch-instance='))
  if (flag) pendingLaunchInstanceId = flag.slice('--launch-instance='.length)
}

function runHookCommand(command: string, cwd: string, env: NodeJS.ProcessEnv): Promise<void> {
  return execAsync(command, { cwd, env }).then(
    () => undefined,
    (err) => {
      throw new Error(`Befehl fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`)
    }
  )
}

export function registerLaunchHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('launch:consumePendingInstanceId', () => {
    const id = pendingLaunchInstanceId
    pendingLaunchInstanceId = null
    return id
  })

  ipcMain.handle('launch:start', async (_event, instanceId: string) => {
    const instance = getInstance(instanceId)
    if (!instance) {
      throw new Error('Instanz nicht gefunden.')
    }

    const authorization = instance.overrideAccountId
      ? await getMclcAuthorizationFor(instance.overrideAccountId)
      : getMclcAuthorization()
    if (!authorization) {
      throw new Error('Bitte zuerst mit Microsoft anmelden.')
    }

    if (activeInstanceIds.has(instanceId)) {
      throw new Error('Diese Instanz läuft bereits.')
    }

    const root = getInstanceRoot(instance.id)
    const hookEnv: NodeJS.ProcessEnv = {
      ...process.env,
      INST_NAME: instance.name,
      INST_ID: instance.folderName ?? instance.id,
      INST_DIR: root,
      INST_MC_DIR: root,
      ...(instance.javaPath ? { INST_JAVA: instance.javaPath } : {})
    }

    if (instance.preLaunchCommand?.trim()) {
      await runHookCommand(instance.preLaunchCommand, root, hookEnv)
    }

    const launchId = randomUUID()
    activeInstanceIds.add(instanceId)
    const launcher = new Client()
    const startedAt = Date.now()

    launcher.on('debug', (e: string) => {
      appendToLaunchLogBuffer(launchId, String(e))
      mainWindow.webContents.send('launch:log', { launchId, instanceId, line: String(e) })
    })
    launcher.on('data', (e: string) => {
      appendToLaunchLogBuffer(launchId, String(e))
      mainWindow.webContents.send('launch:log', { launchId, instanceId, line: String(e) })
    })
    launcher.on('progress', (e: unknown) =>
      mainWindow.webContents.send('launch:progress', { launchId, instanceId, progress: e })
    )
    launcher.on('close', (code: number) => {
      mainWindow.webContents.send('launch:closed', { launchId, instanceId, code })
      activeInstanceIds.delete(instanceId)

      if (code !== 0) {
        const logText = (launchLogBuffers.get(launchId) ?? []).join('\n')
        diagnoseCrash(instanceId, logText)
          .then((diagnosis) => {
            if (!mainWindow.isDestroyed()) {
              mainWindow.webContents.send('launch:crashDiagnosis', { launchId, instanceId, diagnosis })
            }
          })
          .catch(() => {
            // Diagnosis is best-effort - a failure here (e.g. a Java-compat
            // exec call or Modrinth request failing) must never surface as
            // if the launch itself failed differently than it already did.
          })
      }
      launchLogBuffers.delete(launchId)
      if (instance.closeOnLaunch) {
        hideRequesters.delete(launchId)
        if (hideRequesters.size === 0 && !mainWindow.isDestroyed()) mainWindow.show()
      }

      if (instance.trackPlaytime) {
        addPlaytime(instance.id, Date.now() - startedAt)
      }

      if (instance.postExitCommand?.trim()) {
        runHookCommand(instance.postExitCommand, root, hookEnv).catch((err) => {
          mainWindow.webContents.send('launch:log', {
            launchId,
            instanceId,
            line: `[post-exit] ${err instanceof Error ? err.message : String(err)}`
          })
        })
      }

      if (instance.quitAppOnGameClose) {
        // A hosted server is a direct child process of this same Electron
        // main process (see serverProcess.ts) - quitting would kill it too,
        // not just close the launcher window, so this option is suppressed
        // (not silently ignored - the renderer surfaces a notice via
        // launch:quitSuppressed) whenever one is still running.
        if (isAnyServerRunningCheck?.()) {
          if (!mainWindow.isDestroyed()) mainWindow.webContents.send('launch:quitSuppressed', {})
        } else {
          app.quit()
        }
      }
    })

    if (instance.closeOnLaunch) {
      hideRequesters.add(launchId)
      mainWindow.hide()
    }

    const windowOptions: { width?: number; height?: number; fullscreen?: boolean } = {}
    if (instance.windowWidth && instance.windowHeight) {
      windowOptions.width = instance.windowWidth
      windowOptions.height = instance.windowHeight
    }
    if (instance.fullscreen) windowOptions.fullscreen = true

    // MCLC spawns the game process with no explicit `env` option, which
    // means Node defaults to inheriting process.env at that moment - the
    // only hook available to add custom vars without patching MCLC itself.
    // Narrow risk: two concurrently-launched instances with *different*
    // custom env vars could theoretically clobber each other's globally-
    // mutated process.env during the (usually sub-second) window between
    // setting it here and MCLC's internal spawn call. Accepted for now -
    // rare in practice for a personal launcher, and reverted in `finally`.
    const previousEnv: Record<string, string | undefined> = {}
    for (const { name, value } of instance.envVars) {
      previousEnv[name] = process.env[name]
      process.env[name] = value
    }

    const jvmArgs = instance.jvmArgs ? instance.jvmArgs.split(/\s+/).filter(Boolean) : []
    if (needsLegacyDpiWorkaround(instance.mcVersion)) {
      jvmArgs.unshift('-Dsun.java2d.dpiaware=false')
    }

    try {
      await launcher.launch({
        // MCLC's own .d.ts types `user_properties` as `Partial<any>`, which this
        // TS version won't structurally accept a plain string for — but a JSON
        // string is exactly what MCLC's README shows and what msmc produces.
        authorization:
          authorization as unknown as Parameters<InstanceType<typeof Client>['launch']>[0]['authorization'],
        root,
        version: {
          number: instance.mcVersion,
          type: 'release',
          ...(instance.customVersionId ? { custom: instance.customVersionId } : {})
        },
        ...(instance.forgeInstallerPath ? { forge: instance.forgeInstallerPath } : {}),
        memory: {
          max: instance.memoryMax,
          min: instance.memoryMin
        },
        ...(instance.javaPath ? { javaPath: instance.javaPath } : {}),
        ...(jvmArgs.length > 0 ? { customArgs: jvmArgs } : {}),
        ...(instance.mcArgs ? { customLaunchArgs: instance.mcArgs.split(/\s+/).filter(Boolean) } : {}),
        ...(Object.keys(windowOptions).length > 0 ? { window: windowOptions } : {}),
        ...(instance.autoJoinServer
          ? { quickPlay: { type: 'multiplayer' as const, identifier: instance.autoJoinServer } }
          : {})
      })
    } finally {
      for (const [name, value] of Object.entries(previousEnv)) {
        if (value === undefined) delete process.env[name]
        else process.env[name] = value
      }
    }

    markLaunched(instance.id)

    return { launchId }
  })
}
