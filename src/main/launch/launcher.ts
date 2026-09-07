import { ipcMain, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { Client } from 'minecraft-launcher-core'
import { getMclcAuthorization } from '../auth/msmcAuth'
import { getInstance, getInstanceRoot, markLaunched } from '../instances/instanceManager'

// Launcher-window-hide is a single shared window shared across all launches,
// but closeOnLaunch is a per-instance setting - so track which in-flight
// launches asked for it, and only re-show once none of them still want it
// hidden (covers launching two closeOnLaunch instances at once).
const hideRequesters = new Set<string>()

export function registerLaunchHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('launch:start', async (_event, instanceId: string) => {
    const authorization = getMclcAuthorization()
    if (!authorization) {
      throw new Error('Bitte zuerst mit Microsoft anmelden.')
    }

    const instance = getInstance(instanceId)
    if (!instance) {
      throw new Error('Instanz nicht gefunden.')
    }

    const launchId = randomUUID()
    const launcher = new Client()

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
      if (instance.closeOnLaunch) {
        hideRequesters.delete(launchId)
        if (hideRequesters.size === 0 && !mainWindow.isDestroyed()) mainWindow.show()
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

    await launcher.launch({
      // MCLC's own .d.ts types `user_properties` as `Partial<any>`, which this
      // TS version won't structurally accept a plain string for — but a JSON
      // string is exactly what MCLC's README shows and what msmc produces.
      authorization: authorization as unknown as Parameters<InstanceType<typeof Client>['launch']>[0]['authorization'],
      root: getInstanceRoot(instance.id),
      version: {
        number: instance.mcVersion,
        type: 'release',
        ...(instance.customVersionId ? { custom: instance.customVersionId } : {})
      },
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

    markLaunched(instance.id)

    return { launchId }
  })
}
