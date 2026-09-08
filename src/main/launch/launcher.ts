import { ipcMain, BrowserWindow, app } from 'electron'
import { randomUUID } from 'crypto'
import { exec, execFile } from 'child_process'
import { promisify } from 'util'
import { Client } from 'minecraft-launcher-core'
import { getMclcAuthorization, getMclcAuthorizationFor } from '../auth/msmcAuth'
import { getInstance, getInstanceRoot, markLaunched, addPlaytime } from '../instances/instanceManager'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

// Old Minecraft (pre-1.13-ish, LWJGL 2) never declares itself DPI-aware, so
// on any Windows display above 100% scaling, Windows silently scales its
// framebuffer itself - the well-known "tiny correctly-rendered patches,
// rest of the window solid black" glitch. Prism/MultiMC avoid this by
// marking the java executable DPI-aware via the exact same per-user
// compatibility flag Windows' own exe Properties > Compatibility > "Change
// high DPI settings" dialog writes - HKCU-scoped, no elevation needed,
// harmless to set on modern (LWJGL 3) versions that already handle DPI
// correctly on their own.
async function ensureJavaDpiAware(javaPath: string): Promise<void> {
  if (process.platform !== 'win32') return
  try {
    await execFileAsync('reg', [
      'add',
      'HKCU\\Software\\Microsoft\\Windows NT\\CurrentVersion\\AppCompatFlags\\Layers',
      '/v',
      javaPath,
      '/t',
      'REG_SZ',
      '/d',
      '~ HIGHDPIAWARE',
      '/f'
    ])
  } catch {
    // Best-effort - a failure here (e.g. reg.exe unavailable) shouldn't
    // block launching the game, just leaves the DPI glitch unfixed.
  }
}

// instance.javaPath is null for "use the system default", in which case
// MCLC itself just spawns the bare `java` command - resolved here too since
// the DPI-aware flag has to target java's actual absolute exe path, not the
// word "java".
async function resolveJavaPath(explicitPath: string | null): Promise<string> {
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

    const resolvedJavaPath = await resolveJavaPath(instance.javaPath)
    await ensureJavaDpiAware(resolvedJavaPath)

    const launchId = randomUUID()
    activeInstanceIds.add(instanceId)
    const launcher = new Client()
    const startedAt = Date.now()

    launcher.on('debug', (e: string) =>
      mainWindow.webContents.send('launch:log', { launchId, instanceId, line: String(e) })
    )
    launcher.on('data', (e: string) =>
      mainWindow.webContents.send('launch:log', { launchId, instanceId, line: String(e) })
    )
    launcher.on('progress', (e: unknown) =>
      mainWindow.webContents.send('launch:progress', { launchId, instanceId, progress: e })
    )
    launcher.on('close', (code: number) => {
      mainWindow.webContents.send('launch:closed', { launchId, instanceId, code })
      activeInstanceIds.delete(instanceId)
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

      if (instance.quitAppOnGameClose) app.quit()
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
        ...(instance.jvmArgs ? { customArgs: instance.jvmArgs.split(/\s+/).filter(Boolean) } : {}),
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
