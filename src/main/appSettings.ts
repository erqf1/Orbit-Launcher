import { ipcMain, app, dialog, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { randomUUID } from 'crypto'
import { refocusMainWindow } from './windowFocus'

interface AppSettings {
  customBackgrounds: string[]
  curseforgeApiKey: string | null
  playitSecretKey: string | null
  playitTunnelPort: number
  playitTunnelAddress: string | null
}

const DEFAULT_SETTINGS: AppSettings = {
  customBackgrounds: [],
  curseforgeApiKey: null,
  playitSecretKey: null,
  playitTunnelPort: 25565,
  playitTunnelAddress: null
}

function getSettingsFile(): string {
  return join(app.getPath('userData'), 'appSettings.json')
}

function readSettings(): AppSettings {
  const file = getSettingsFile()
  if (!existsSync(file)) return { ...DEFAULT_SETTINGS }
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(readFileSync(file, 'utf-8')) }
  } catch {
    return { ...DEFAULT_SETTINGS }
  }
}

function writeSettings(settings: AppSettings): void {
  writeFileSync(getSettingsFile(), JSON.stringify(settings, null, 2), 'utf-8')
}

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif'
}

function backgroundStoreDir(): string {
  return join(app.getPath('userData'), 'background')
}

// Files added by the user are copied into userData (keyed by a random id)
// rather than referenced by their original path, so a background survives
// the source file moving/being deleted and doesn't need a file:// path
// exposed to the renderer.
function toDataUrl(storedPath: string): string | null {
  if (!existsSync(storedPath)) return null
  const mime = IMAGE_MIME_BY_EXT[extname(storedPath).toLowerCase()]
  if (!mime) return null
  return `data:${mime};base64,${readFileSync(storedPath).toString('base64')}`
}

export function listCustomBackgrounds(): string[] {
  const settings = readSettings()
  return settings.customBackgrounds.map(toDataUrl).filter((url): url is string => url !== null)
}

export async function addCustomBackground(): Promise<string[]> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Bilder', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
  })
  refocusMainWindow()
  if (result.canceled || result.filePaths.length === 0) return listCustomBackgrounds()
  const src = result.filePaths[0]
  const ext = extname(src).toLowerCase()
  if (!IMAGE_MIME_BY_EXT[ext]) throw new Error('Nicht unterstütztes Bildformat.')
  const dir = backgroundStoreDir()
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, `${randomUUID()}-${basename(src)}`)
  copyFileSync(src, dest)
  const settings = readSettings()
  settings.customBackgrounds.push(dest)
  writeSettings(settings)
  return listCustomBackgrounds()
}

export function removeCustomBackground(index: number): string[] {
  const settings = readSettings()
  const [removed] = settings.customBackgrounds.splice(index, 1)
  if (removed && existsSync(removed)) unlinkSync(removed)
  writeSettings(settings)
  return listCustomBackgrounds()
}

// A launcher-wide setting rather than per-instance: the same CurseForge
// account/key covers every modpack import, and CurseForge (unlike Modrinth)
// requires third-party apps to bring their own key - there's no way around
// asking the user for one (same situation as the playit.gg secret key).
export function getCurseForgeApiKey(): string | null {
  return readSettings().curseforgeApiKey
}

export function setCurseForgeApiKey(key: string | null): void {
  const settings = readSettings()
  settings.curseforgeApiKey = key?.trim() || null
  writeSettings(settings)
}

export interface PlayitTunnelConfig {
  secretKey: string | null
  localPort: number
  publicAddress: string | null
}

// One shared playit.gg agent/tunnel for the whole launcher rather than one
// per hosted server - the manual "create a tunnel" step on playit.gg's
// dashboard (there's no API for it, confirmed with their own support team)
// only has to happen once ever, at the cost of only one hosted server being
// able to run - and be reachable through it - at a time (enforced in
// serverProcess.ts's startServer).
export function getPlayitTunnelConfig(): PlayitTunnelConfig {
  const settings = readSettings()
  return {
    secretKey: settings.playitSecretKey,
    localPort: settings.playitTunnelPort,
    publicAddress: settings.playitTunnelAddress
  }
}

export function setPlayitSecretKey(key: string | null): void {
  const settings = readSettings()
  settings.playitSecretKey = key?.trim() || null
  writeSettings(settings)
}

export function setPlayitTunnelPort(port: number): void {
  const settings = readSettings()
  settings.playitTunnelPort = port
  writeSettings(settings)
}

export function setPlayitTunnelAddress(address: string | null): void {
  const settings = readSettings()
  settings.playitTunnelAddress = address?.trim() || null
  writeSettings(settings)
}

export function registerAppSettingsHandlers(): void {
  ipcMain.handle('background:list', () => listCustomBackgrounds())
  ipcMain.handle('background:add', () => addCustomBackground())
  ipcMain.handle('background:remove', (_e, index: number) => removeCustomBackground(index))
  ipcMain.handle('appSettings:getCurseForgeApiKey', () => getCurseForgeApiKey())
  ipcMain.handle('appSettings:setCurseForgeApiKey', (_e, key: string | null) => setCurseForgeApiKey(key))
  ipcMain.handle('appSettings:getPlayitTunnelConfig', () => getPlayitTunnelConfig())
  ipcMain.handle('appSettings:setPlayitSecretKey', (_e, key: string | null) => setPlayitSecretKey(key))
  ipcMain.handle('appSettings:setPlayitTunnelPort', (_e, port: number) => setPlayitTunnelPort(port))
  ipcMain.handle('appSettings:setPlayitTunnelAddress', (_e, address: string | null) => setPlayitTunnelAddress(address))
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
}
