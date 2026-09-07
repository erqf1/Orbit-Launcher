import { ipcMain, BrowserWindow } from 'electron'
import { Client } from 'minecraft-launcher-core'
import { getMclcAuthorization } from '../auth/msmcAuth'
import { getInstance, getInstanceRoot, markLaunched } from '../instances/instanceManager'

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

    const launcher = new Client()

    launcher.on('debug', (e: string) => mainWindow.webContents.send('launch:log', String(e)))
    launcher.on('data', (e: string) => mainWindow.webContents.send('launch:log', String(e)))
    launcher.on('progress', (e: unknown) => mainWindow.webContents.send('launch:progress', e))
    launcher.on('close', (code: number) => mainWindow.webContents.send('launch:closed', code))

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
      }
    })

    markLaunched(instance.id)

    return { started: true }
  })
}
