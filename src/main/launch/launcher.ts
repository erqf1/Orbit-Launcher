import { ipcMain, app, BrowserWindow } from 'electron'
import { join } from 'path'
import { Client } from 'minecraft-launcher-core'
import { getMclcAuthorization } from '../auth/msmcAuth'

let cachedLatestRelease: string | null = null

// Phase 1 always launches the current latest vanilla release rather than a
// hardcoded version string, so the launcher doesn't go stale over time.
async function getLatestReleaseVersion(): Promise<string> {
  if (cachedLatestRelease) return cachedLatestRelease
  const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
  const manifest = (await res.json()) as { latest: { release: string } }
  cachedLatestRelease = manifest.latest.release
  return cachedLatestRelease
}

export function registerLaunchHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('launch:start', async () => {
    const authorization = getMclcAuthorization()
    if (!authorization) {
      throw new Error('Bitte zuerst mit Microsoft anmelden.')
    }

    const version = await getLatestReleaseVersion()
    const root = join(app.getPath('userData'), 'instances', 'default')
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
      root,
      version: {
        number: version,
        type: 'release'
      },
      memory: {
        max: '4G',
        min: '2G'
      }
    })

    return { started: true, version }
  })
}
