import { ipcMain, app, dialog, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync, unlinkSync } from 'fs'
import { join, extname, basename } from 'path'
import { randomUUID } from 'crypto'
import { refocusMainWindow } from './windowFocus'

interface AppSettings {
  customBackgrounds: string[]
  curseforgeApiKey: string | null
}

const DEFAULT_SETTINGS: AppSettings = { customBackgrounds: [], curseforgeApiKey: null }

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

export function registerAppSettingsHandlers(): void {
  ipcMain.handle('background:list', () => listCustomBackgrounds())
  ipcMain.handle('background:add', () => addCustomBackground())
  ipcMain.handle('background:remove', (_e, index: number) => removeCustomBackground(index))
  ipcMain.handle('appSettings:getCurseForgeApiKey', () => getCurseForgeApiKey())
  ipcMain.handle('appSettings:setCurseForgeApiKey', (_e, key: string | null) => setCurseForgeApiKey(key))
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
}
