import { ipcMain, dialog } from 'electron'
import { existsSync, readFileSync, readdirSync, cpSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  createInstance,
  getInstance,
  getInstanceRoot,
  type Instance
} from '../instances/instanceManager'
import { refocusMainWindow } from '../windowFocus'

function defaultMinecraftRoot(): string | null {
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    return appData ? join(appData, '.minecraft') : null
  }
  if (process.platform === 'linux') return join(homedir(), '.minecraft')
  if (process.platform === 'darwin') return join(homedir(), 'Library/Application Support/minecraft')
  return null
}

export function detectOfficialRoot(): string | null {
  const root = defaultMinecraftRoot()
  return root && existsSync(root) ? root : null
}

interface LauncherProfilesFile {
  profiles?: Record<string, { lastVersionId?: string }>
}

function guessLatestVersion(root: string): string | null {
  const profilesPath = join(root, 'launcher_profiles.json')
  if (existsSync(profilesPath)) {
    try {
      const data = JSON.parse(readFileSync(profilesPath, 'utf-8')) as LauncherProfilesFile
      const versionId = Object.values(data.profiles ?? {}).find((p) => p.lastVersionId)?.lastVersionId
      if (versionId) return versionId
    } catch {
      // fall through to scanning versions/ directly
    }
  }
  const versionsDir = join(root, 'versions')
  if (existsSync(versionsDir)) {
    const entries = readdirSync(versionsDir).filter((e) => existsSync(join(versionsDir, e, `${e}.json`)))
    if (entries.length > 0) return entries[0]
  }
  return null
}

// The official launcher (unlike Prism) doesn't have separate per-instance
// folders - everything (every version, every world, every resource pack)
// lives in one shared .minecraft. So this imports it as a single vanilla
// instance rather than trying to enumerate "instances" that don't exist
// there, pinned to whichever version launcher_profiles.json last used
// (falling back to just the first installed version if that file is
// missing/unreadable). Only the instance-relevant folders are copied - NOT
// the whole .minecraft wholesale like Prism's importer does, since assets/
// and libraries/ there can be many GB and this app downloads its own copies
// at launch time anyway.
const COPYABLE_ENTRIES = [
  'saves',
  'resourcepacks',
  'shaderpacks',
  'mods',
  'screenshots',
  'config',
  'logs',
  'crash-reports',
  'options.txt',
  'servers.dat'
]

export async function importOfficialMinecraft(rootOverride?: string): Promise<Instance> {
  const root = rootOverride ?? defaultMinecraftRoot()
  if (!root || !existsSync(root)) throw new Error('.minecraft-Ordner nicht gefunden.')

  const mcVersion = guessLatestVersion(root)
  if (!mcVersion) throw new Error('Keine installierte Minecraft-Version in diesem Ordner gefunden.')

  const instance = await createInstance({ name: 'Minecraft Launcher', mcVersion, loader: 'vanilla' })
  const destRoot = getInstanceRoot(instance.id)

  for (const entry of COPYABLE_ENTRIES) {
    const src = join(root, entry)
    if (existsSync(src)) cpSync(src, join(destRoot, entry), { recursive: true, force: true })
  }

  return getInstance(instance.id) as Instance
}

export function registerOfficialImportHandlers(): void {
  ipcMain.handle('official:detectRoot', () => detectOfficialRoot())
  ipcMain.handle('official:import', (_e, rootOverride?: string) => importOfficialMinecraft(rootOverride))
  ipcMain.handle('official:browseFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    refocusMainWindow()
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
