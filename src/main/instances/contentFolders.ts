import { ipcMain, dialog, shell } from 'electron'
import { existsSync, mkdirSync, readdirSync, statSync, renameSync, rmSync, copyFileSync, cpSync } from 'fs'
import { join, basename } from 'path'
import { getInstanceRoot } from './instanceManager'

export interface ContentFileEntry {
  name: string
  size: number
  modifiedAt: string
  isDirectory: boolean
}

// Resource packs and shader packs get simple file management (list/add/
// remove/rename/open folder) but not Prism's enable/disable toggle - that
// requires parsing and rewriting Minecraft's own options.txt (resource
// packs) or an Iris-specific config (shader packs) rather than a plain
// rename like mods use, and the in-game menus already cover picking which
// ones are active.
const ALLOWED_SUBFOLDERS = ['resourcepacks', 'shaderpacks', 'screenshots'] as const
export type ContentSubfolder = (typeof ALLOWED_SUBFOLDERS)[number]

function assertAllowedSubfolder(subfolder: string): asserts subfolder is ContentSubfolder {
  if (!(ALLOWED_SUBFOLDERS as readonly string[]).includes(subfolder)) {
    throw new Error(`Ungültiger Ordner: ${subfolder}`)
  }
}

function assertSafeName(name: string): void {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Ungültiger Dateiname.')
  }
}

export function listContentFiles(instanceId: string, subfolder: string): ContentFileEntry[] {
  assertAllowedSubfolder(subfolder)
  const dir = join(getInstanceRoot(instanceId), subfolder)
  if (!existsSync(dir)) return []
  return readdirSync(dir).map((name) => {
    const stat = statSync(join(dir, name))
    return { name, size: stat.size, modifiedAt: stat.mtime.toISOString(), isDirectory: stat.isDirectory() }
  })
}

export function removeContentFile(instanceId: string, subfolder: string, name: string): void {
  assertAllowedSubfolder(subfolder)
  assertSafeName(name)
  const target = join(getInstanceRoot(instanceId), subfolder, name)
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
}

export function renameContentFile(instanceId: string, subfolder: string, oldName: string, newName: string): void {
  assertAllowedSubfolder(subfolder)
  assertSafeName(oldName)
  assertSafeName(newName)
  const dir = join(getInstanceRoot(instanceId), subfolder)
  renameSync(join(dir, oldName), join(dir, newName))
}

export async function addContentFiles(instanceId: string, subfolder: string): Promise<number> {
  assertAllowedSubfolder(subfolder)
  const result = await dialog.showOpenDialog({ properties: ['openFile', 'multiSelections'] })
  if (result.canceled) return 0
  const dir = join(getInstanceRoot(instanceId), subfolder)
  mkdirSync(dir, { recursive: true })
  for (const src of result.filePaths) {
    const stat = statSync(src)
    const dest = join(dir, basename(src))
    if (stat.isDirectory()) cpSync(src, dest, { recursive: true, force: true })
    else copyFileSync(src, dest)
  }
  return result.filePaths.length
}

export function openContentFolder(instanceId: string, subfolder: string): Promise<void> {
  assertAllowedSubfolder(subfolder)
  const dir = join(getInstanceRoot(instanceId), subfolder)
  mkdirSync(dir, { recursive: true })
  return shell.openPath(dir).then((err) => {
    if (err) throw new Error(err)
  })
}

export function registerContentFolderHandlers(): void {
  ipcMain.handle('content:list', (_e, instanceId: string, subfolder: string) =>
    listContentFiles(instanceId, subfolder)
  )
  ipcMain.handle('content:remove', (_e, instanceId: string, subfolder: string, name: string) =>
    removeContentFile(instanceId, subfolder, name)
  )
  ipcMain.handle(
    'content:rename',
    (_e, instanceId: string, subfolder: string, oldName: string, newName: string) =>
      renameContentFile(instanceId, subfolder, oldName, newName)
  )
  ipcMain.handle('content:add', (_e, instanceId: string, subfolder: string) =>
    addContentFiles(instanceId, subfolder)
  )
  ipcMain.handle('content:openFolder', (_e, instanceId: string, subfolder: string) =>
    openContentFolder(instanceId, subfolder)
  )
}
