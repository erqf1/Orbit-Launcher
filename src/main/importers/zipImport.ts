import { ipcMain, dialog } from 'electron'
import AdmZip from 'adm-zip'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, join, relative, sep, basename } from 'path'
import {
  createInstance,
  getInstance,
  getInstanceRoot,
  type Instance,
  type LoaderType
} from '../instances/instanceManager'
import { mapWithConcurrency } from '../mods/modrinth'
import { getCurseForgeApiKey } from '../appSettings'
import { refocusMainWindow } from '../windowFocus'

export type ZipFormat = 'mrpack' | 'curseforge' | 'unknown'

export interface ZipImportResult {
  instance: Instance
  // Files that couldn't be fetched (private/removed CurseForge file, or a
  // transient download error) - collected rather than failing the whole
  // import, same rationale as PrismImportDialog's per-instance failure list:
  // one bad entry in a pack of 100 mods shouldn't lose the other 99.
  failures: string[]
}

// A zip's own top-level layout varies - some packs put modrinth.index.json/
// manifest.json right at the zip root, others wrap everything in one named
// folder (e.g. "MyPack-1.0/modrinth.index.json"). Only a single level of
// wrapping is checked for, matching every real modpack export tool's own
// convention (Modrinth's own packager and CurseForge's client both write
// flat, "one wrapping folder at most" zips).
function findMarker(zip: AdmZip, markerName: string): { entry: AdmZip.IZipEntry; prefix: string } | null {
  for (const entry of zip.getEntries()) {
    if (entry.entryName === markerName) return { entry, prefix: '' }
  }
  for (const entry of zip.getEntries()) {
    const parts = entry.entryName.split('/')
    if (parts.length === 2 && parts[1] === markerName) return { entry, prefix: `${parts[0]}/` }
  }
  return null
}

export function detectZipFormat(zipPath: string): ZipFormat {
  const zip = new AdmZip(zipPath)
  if (findMarker(zip, 'modrinth.index.json')) return 'mrpack'
  if (findMarker(zip, 'manifest.json')) return 'curseforge'
  return 'unknown'
}

// Guards against a malicious/corrupt archive entry writing outside the
// instance folder via a `path`/`fileName` containing "../" - same
// resolve+relative check as serverFiles.ts's resolveSafePath, applied here
// per zip entry instead of per user-supplied relative path.
function safeDestination(root: string, relPath: string): string {
  const target = join(root, relPath)
  const rel = relative(root, target)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`Unsicherer Pfad in Archiv: ${relPath}`)
  }
  return target
}

function extractFolderFromZip(zip: AdmZip, folderPrefix: string, destRoot: string): void {
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue
    if (!entry.entryName.startsWith(folderPrefix)) continue
    const relPath = entry.entryName.slice(folderPrefix.length)
    if (!relPath) continue
    const dest = safeDestination(destRoot, relPath)
    mkdirSync(dirname(dest), { recursive: true })
    writeFileSync(dest, entry.getData())
  }
}

interface MrpackIndex {
  name?: string
  files: Array<{
    path: string
    env?: { client?: string }
    downloads: string[]
  }>
  dependencies: Record<string, string>
}

const MRPACK_LOADER_KEYS: Record<string, LoaderType> = {
  'fabric-loader': 'fabric',
  'quilt-loader': 'quilt',
  forge: 'forge',
  neoforge: 'neoforge'
}

async function importMrpackZip(zipPath: string): Promise<ZipImportResult> {
  const zip = new AdmZip(zipPath)
  const marker = findMarker(zip, 'modrinth.index.json')
  if (!marker) throw new Error('modrinth.index.json nicht gefunden.')

  const index = JSON.parse(zip.readAsText(marker.entry)) as MrpackIndex
  const mcVersion = index.dependencies.minecraft
  if (!mcVersion) throw new Error('Keine Minecraft-Version in modrinth.index.json angegeben.')

  let loader: LoaderType = 'vanilla'
  let loaderVersion: string | undefined
  for (const [depKey, loaderType] of Object.entries(MRPACK_LOADER_KEYS)) {
    if (index.dependencies[depKey]) {
      loader = loaderType
      loaderVersion = index.dependencies[depKey]
      break
    }
  }

  const instance = await createInstance({
    name: index.name || basename(zipPath, '.mrpack'),
    mcVersion,
    loader,
    loaderVersion
  })
  const destRoot = getInstanceRoot(instance.id)

  const failures: string[] = []
  const downloadable = index.files.filter((f) => f.env?.client !== 'unsupported')
  await mapWithConcurrency(downloadable, 6, async (file) => {
    try {
      const url = file.downloads[0]
      if (!url) throw new Error('Kein Download-Link.')
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const dest = safeDestination(destRoot, file.path)
      mkdirSync(dirname(dest), { recursive: true })
      writeFileSync(dest, buffer)
    } catch (err) {
      failures.push(`${file.path}: ${err instanceof Error ? err.message : String(err)}`)
    }
  })

  extractFolderFromZip(zip, `${marker.prefix}overrides/`, destRoot)
  extractFolderFromZip(zip, `${marker.prefix}client-overrides/`, destRoot)

  return { instance: getInstance(instance.id) as Instance, failures }
}

interface CurseForgeManifest {
  minecraft: { version: string; modLoaders: Array<{ id: string; primary?: boolean }> }
  name?: string
  files: Array<{ projectID: number; fileID: number; required?: boolean }>
  overrides?: string
}

interface CurseForgeFileData {
  id: number
  fileName: string
  downloadUrl: string | null
}

const CURSEFORGE_LOADER_NAMES: Record<string, LoaderType> = {
  forge: 'forge',
  neoforge: 'neoforge',
  fabric: 'fabric',
  quilt: 'quilt'
}

async function resolveCurseForgeFiles(fileIds: number[], apiKey: string): Promise<CurseForgeFileData[]> {
  const res = await fetch('https://api.curseforge.com/v1/mods/files', {
    method: 'POST',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ fileIds })
  })
  if (!res.ok) {
    if (res.status === 403) throw new Error('CurseForge-API-Key ungültig oder abgelehnt.')
    throw new Error(`CurseForge-API-Fehler (HTTP ${res.status}).`)
  }
  const body = (await res.json()) as { data: CurseForgeFileData[] }
  return body.data
}

async function importCurseForgeZip(zipPath: string, apiKey: string): Promise<ZipImportResult> {
  const zip = new AdmZip(zipPath)
  const marker = findMarker(zip, 'manifest.json')
  if (!marker) throw new Error('manifest.json nicht gefunden.')

  const manifest = JSON.parse(zip.readAsText(marker.entry)) as CurseForgeManifest
  const mcVersion = manifest.minecraft?.version
  if (!mcVersion) throw new Error('Keine Minecraft-Version in manifest.json angegeben.')

  const modLoader =
    manifest.minecraft.modLoaders.find((l) => l.primary) ?? manifest.minecraft.modLoaders[0]
  let loader: LoaderType = 'vanilla'
  let loaderVersion: string | undefined
  if (modLoader) {
    const dash = modLoader.id.indexOf('-')
    const loaderName = dash === -1 ? modLoader.id : modLoader.id.slice(0, dash)
    const version = dash === -1 ? undefined : modLoader.id.slice(dash + 1)
    if (loaderName in CURSEFORGE_LOADER_NAMES) {
      loader = CURSEFORGE_LOADER_NAMES[loaderName]
      loaderVersion = version
    }
  }

  const instance = await createInstance({
    name: manifest.name || basename(zipPath, '.zip'),
    mcVersion,
    loader,
    loaderVersion
  })
  const destRoot = getInstanceRoot(instance.id)
  const modsDir = join(destRoot, 'mods')
  mkdirSync(modsDir, { recursive: true })

  const failures: string[] = []
  if (manifest.files.length > 0) {
    let resolved: CurseForgeFileData[]
    try {
      resolved = await resolveCurseForgeFiles(manifest.files.map((f) => f.fileID), apiKey)
    } catch (err) {
      throw err instanceof Error ? err : new Error(String(err))
    }
    const byId = new Map(resolved.map((f) => [f.id, f]))

    await mapWithConcurrency(manifest.files, 6, async (file) => {
      const data = byId.get(file.fileID)
      if (!data) {
        failures.push(`Datei-ID ${file.fileID}: von CurseForge nicht gefunden.`)
        return
      }
      if (!data.downloadUrl) {
        // A real, common CurseForge situation: the mod author disabled
        // third-party download links, so the API itself never hands one
        // out - not something a retry or a different endpoint fixes.
        failures.push(`${data.fileName}: Autor hat Downloads über Drittanbieter-Apps deaktiviert.`)
        return
      }
      try {
        const res = await fetch(data.downloadUrl)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buffer = Buffer.from(await res.arrayBuffer())
        writeFileSync(join(modsDir, data.fileName), buffer)
      } catch (err) {
        failures.push(`${data.fileName}: ${err instanceof Error ? err.message : String(err)}`)
      }
    })
  }

  extractFolderFromZip(zip, `${marker.prefix}${manifest.overrides || 'overrides'}/`, destRoot)

  return { instance: getInstance(instance.id) as Instance, failures }
}

export async function importZip(zipPath: string): Promise<ZipImportResult> {
  const format = detectZipFormat(zipPath)
  if (format === 'mrpack') return importMrpackZip(zipPath)
  if (format === 'curseforge') {
    const apiKey = getCurseForgeApiKey()
    if (!apiKey) {
      throw new Error(
        'Dieses Modpack ist ein CurseForge-Export - dafür wird ein eigener CurseForge-API-Key benötigt (kostenlos unter console.curseforge.com), da CurseForge das im Gegensatz zu Modrinth für Drittanbieter-Apps verlangt.'
      )
    }
    return importCurseForgeZip(zipPath, apiKey)
  }
  throw new Error('Unbekanntes ZIP-Format - weder ein Modrinth-Modpack (.mrpack) noch ein CurseForge-Modpack erkannt.')
}

export function registerZipImportHandlers(): void {
  ipcMain.handle('zipImport:detectFormat', (_event, zipPath: string) => detectZipFormat(zipPath))
  ipcMain.handle('zipImport:import', (_event, zipPath: string) => importZip(zipPath))
  ipcMain.handle('zipImport:browseZipFile', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Modpack-Archiv', extensions: ['zip', 'mrpack'] }]
    })
    refocusMainWindow()
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
