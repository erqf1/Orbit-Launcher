import { ipcMain, dialog, shell, clipboard, ClipboardItem } from 'electron'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  renameSync,
  rmSync,
  copyFileSync,
  cpSync,
  readFileSync,
  writeFileSync
} from 'fs'
import { join, basename, extname } from 'path'
import { getInstanceRoot } from './instanceManager'
import { mapWithConcurrency, resolveModInfo, type ModFileRef } from '../mods/modrinth'
import { refocusMainWindow } from '../windowFocus'

export interface ContentFileEntry {
  name: string
  size: number
  modifiedAt: string
  isDirectory: boolean
}

export interface EnrichedContentFile extends ContentFileEntry {
  title: string | null
  versionNumber: string | null
  iconUrl: string | null
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

// Resource packs / shader packs are ordinary zip files (unlike screenshots,
// which never get this) - same Modrinth file-hash enrichment as installed
// mods (icon/title/version), directory entries skipped since the lookup
// only makes sense for a single file's hash.
export async function listContentFilesEnriched(
  instanceId: string,
  subfolder: string
): Promise<EnrichedContentFile[]> {
  const entries = listContentFiles(instanceId, subfolder)
  const dir = join(getInstanceRoot(instanceId), subfolder)
  return mapWithConcurrency(entries, 8, async (entry): Promise<EnrichedContentFile> => {
    if (entry.isDirectory) return { ...entry, title: null, versionNumber: null, iconUrl: null }
    const info = await resolveModInfo(join(dir, entry.name), entry.name)
    return { ...entry, ...info }
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
  refocusMainWindow()
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

const IMAGE_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

// Same data: URL approach as instance icons - avoids exposing file:// paths
// to the renderer (and the CSP changes that would need).
export function getContentFileDataUrl(instanceId: string, subfolder: string, name: string): string | null {
  assertAllowedSubfolder(subfolder)
  assertSafeName(name)
  const mime = IMAGE_MIME_BY_EXT[extname(name).toLowerCase()]
  if (!mime) return null
  const filePath = join(getInstanceRoot(instanceId), subfolder, name)
  if (!existsSync(filePath)) return null
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
}

// Electron 44 replaced the old sync clipboard.writeImage with an async,
// MIME-typed ClipboardItem API (clipboard-item docs) - construct one
// directly from the file's bytes rather than round-tripping through
// nativeImage, which no longer has a matching write path here.
export async function copyContentFileToClipboard(
  instanceId: string,
  subfolder: string,
  name: string
): Promise<void> {
  assertAllowedSubfolder(subfolder)
  assertSafeName(name)
  const mime = IMAGE_MIME_BY_EXT[extname(name).toLowerCase()]
  if (!mime) throw new Error('Kein unterstütztes Bildformat.')
  const filePath = join(getInstanceRoot(instanceId), subfolder, name)
  if (!existsSync(filePath)) throw new Error('Datei nicht gefunden.')
  const blob = new Blob([readFileSync(filePath)], { type: mime })
  await clipboard.write([new ClipboardItem({ [mime]: blob })])
}

// Downloads a Modrinth file straight into a resourcepacks/shaderpacks
// folder - the mods-folder equivalent (installMod in modrinth.ts) is kept
// separate since it's mods-specific already; this one covers the other two
// subfolders that also gained Modrinth browsing.
export async function installContentFile(instanceId: string, subfolder: string, file: ModFileRef): Promise<void> {
  assertAllowedSubfolder(subfolder)
  assertSafeName(file.filename)
  const dir = join(getInstanceRoot(instanceId), subfolder)
  mkdirSync(dir, { recursive: true })
  const res = await fetch(file.url)
  if (!res.ok) throw new Error(`Download fehlgeschlagen (HTTP ${res.status}).`)
  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(dir, file.filename), buffer)
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
  ipcMain.handle('content:listEnriched', (_e, instanceId: string, subfolder: string) =>
    listContentFilesEnriched(instanceId, subfolder)
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
  ipcMain.handle('content:getDataUrl', (_e, instanceId: string, subfolder: string, name: string) =>
    getContentFileDataUrl(instanceId, subfolder, name)
  )
  ipcMain.handle('content:copyToClipboard', (_e, instanceId: string, subfolder: string, name: string) =>
    copyContentFileToClipboard(instanceId, subfolder, name)
  )
  ipcMain.handle('content:installFromUrl', (_e, instanceId: string, subfolder: string, file: ModFileRef) =>
    installContentFile(instanceId, subfolder, file)
  )
}
