import { ipcMain, dialog } from 'electron'
import { existsSync, cpSync } from 'fs'
import { join, basename } from 'path'
import {
  createInstance,
  getInstance,
  getInstanceRoot,
  type Instance,
  type LoaderType
} from '../instances/instanceManager'
import { COPYABLE_ENTRIES } from './officialImport'
import { refocusMainWindow } from '../windowFocus'

// The "manual" import path used to hand the chosen folder straight to
// PrismImportDialog, which only understands Prism's own on-disk format
// (instance.cfg/mmc-pack.json) - pointing it at any other folder just found
// nothing. This is the actual "point at any folder yourself" import: no
// launcher-specific metadata required, the user just tells us the
// version/loader themselves (same VersionLoaderFields form CreateInstanceDialog
// uses) and we copy whatever's there across.
function resolveContentRoot(folderPath: string): string {
  // Accepts either the game folder itself (has mods/saves/resourcepacks/config
  // directly) or its parent (e.g. someone points at a Prism/MultiMC instance's
  // outer folder without using the dedicated Prism import) - checked by name
  // since Prism itself supports both spellings depending on when the instance
  // was created (see prismImport.ts's findGameRoot for the same rationale).
  const nested = existsSync(join(folderPath, 'minecraft'))
    ? join(folderPath, 'minecraft')
    : existsSync(join(folderPath, '.minecraft'))
      ? join(folderPath, '.minecraft')
      : null
  if (nested) return nested
  return folderPath
}

export async function importGenericFolder(
  folderPath: string,
  name: string,
  mcVersion: string,
  loader: LoaderType,
  loaderVersion?: string
): Promise<Instance> {
  if (!existsSync(folderPath)) throw new Error('Ordner nicht gefunden.')

  const instance = await createInstance({ name, mcVersion, loader, loaderVersion })
  const destRoot = getInstanceRoot(instance.id)
  const contentRoot = resolveContentRoot(folderPath)

  for (const entry of COPYABLE_ENTRIES) {
    const src = join(contentRoot, entry)
    if (existsSync(src)) cpSync(src, join(destRoot, entry), { recursive: true, force: true })
  }

  return getInstance(instance.id) as Instance
}

export function suggestNameFromFolder(folderPath: string): string {
  return basename(folderPath)
}

export function registerFolderImportHandlers(): void {
  ipcMain.handle(
    'folderImport:import',
    (_event, folderPath: string, name: string, mcVersion: string, loader: LoaderType, loaderVersion?: string) =>
      importGenericFolder(folderPath, name, mcVersion, loader, loaderVersion)
  )
  ipcMain.handle('folderImport:browseFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    refocusMainWindow()
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
