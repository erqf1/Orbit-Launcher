import { ipcMain, app, shell } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

interface AppSettings {
  curseforgeApiKey: string | null
  playitSecretKey: string | null
  playitTunnelPort: number
  playitTunnelAddress: string | null
}

const DEFAULT_SETTINGS: AppSettings = {
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
  ipcMain.handle('appSettings:getCurseForgeApiKey', () => getCurseForgeApiKey())
  ipcMain.handle('appSettings:setCurseForgeApiKey', (_e, key: string | null) => setCurseForgeApiKey(key))
  ipcMain.handle('appSettings:getPlayitTunnelConfig', () => getPlayitTunnelConfig())
  ipcMain.handle('appSettings:setPlayitSecretKey', (_e, key: string | null) => setPlayitSecretKey(key))
  ipcMain.handle('appSettings:setPlayitTunnelPort', (_e, port: number) => setPlayitTunnelPort(port))
  ipcMain.handle('appSettings:setPlayitTunnelAddress', (_e, address: string | null) => setPlayitTunnelAddress(address))
  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))
}
