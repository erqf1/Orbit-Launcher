import { ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getInstanceRoot } from '../instances/instanceManager'

const MODRINTH_API = 'https://api.modrinth.com/v2'

export interface ModSearchResult {
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl: string | null
  downloads: number
}

export interface ModVersionSummary {
  id: string
  versionNumber: string
  filename: string
  url: string
  requiredDependencyProjectIds: string[]
}

export interface ModFileRef {
  url: string
  filename: string
}

function assertSafeFilename(filename: string): void {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Ungültiger Dateiname.')
  }
}

export async function searchMods(
  query: string,
  mcVersion: string,
  loader: string
): Promise<ModSearchResult[]> {
  const facets = [
    ['project_type:mod'],
    [`versions:${mcVersion}`],
    ...(loader !== 'vanilla' ? [[`categories:${loader}`]] : [])
  ]
  const url = `${MODRINTH_API}/search?query=${encodeURIComponent(query)}&limit=20&facets=${encodeURIComponent(JSON.stringify(facets))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Modrinth-Suche fehlgeschlagen (HTTP ${res.status}).`)
  const data = (await res.json()) as {
    hits: Array<{
      project_id: string
      slug: string
      title: string
      description: string
      icon_url: string | null
      downloads: number
    }>
  }
  return data.hits.map((hit) => ({
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    iconUrl: hit.icon_url,
    downloads: hit.downloads
  }))
}

export async function getProjectInfo(projectId: string): Promise<ModSearchResult> {
  const res = await fetch(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}`)
  if (!res.ok) throw new Error(`Mod-Info konnte nicht geladen werden (HTTP ${res.status}).`)
  const p = (await res.json()) as {
    id: string
    slug: string
    title: string
    description: string
    icon_url: string | null
    downloads: number
  }
  return {
    projectId: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    iconUrl: p.icon_url,
    downloads: p.downloads
  }
}

export async function listModVersions(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModVersionSummary[]> {
  const loaders = loader === 'vanilla' ? [] : [loader]
  const url = `${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version?loaders=${encodeURIComponent(JSON.stringify(loaders))}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Mod-Versionen konnten nicht geladen werden (HTTP ${res.status}).`)
  const versions = (await res.json()) as Array<{
    id: string
    version_number: string
    files: Array<{ url: string; filename: string; primary: boolean }>
    dependencies: Array<{ project_id: string | null; dependency_type: string }>
  }>
  const summaries: ModVersionSummary[] = []
  for (const v of versions) {
    const file = v.files.find((f) => f.primary) ?? v.files[0]
    if (!file) continue
    const requiredDependencyProjectIds = v.dependencies
      .filter((d) => d.dependency_type === 'required' && d.project_id)
      .map((d) => d.project_id as string)
    summaries.push({
      id: v.id,
      versionNumber: v.version_number,
      filename: file.filename,
      url: file.url,
      requiredDependencyProjectIds
    })
  }
  return summaries
}

// Resolves the required-dependency project IDs on a mod's best-matching
// version into full project info, so the UI can show names before
// installing (rather than the user finding out mid-game via a crash log).
export async function getRequiredDependencies(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModSearchResult[]> {
  const versions = await listModVersions(projectId, mcVersion, loader)
  const best = versions[0]
  if (!best || best.requiredDependencyProjectIds.length === 0) return []

  const infos = await Promise.all(
    best.requiredDependencyProjectIds.map((id) => getProjectInfo(id).catch(() => null))
  )
  return infos.filter((info): info is ModSearchResult => info !== null)
}

export async function installMod(instanceId: string, file: ModFileRef): Promise<void> {
  assertSafeFilename(file.filename)

  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  mkdirSync(modsDir, { recursive: true })

  const res = await fetch(file.url)
  if (!res.ok) throw new Error(`Mod-Download fehlgeschlagen (HTTP ${res.status}).`)

  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(modsDir, file.filename), buffer)
}

export function listInstalledMods(instanceId: string): string[] {
  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  if (!existsSync(modsDir)) return []
  return readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar'))
}

export function removeMod(instanceId: string, filename: string): void {
  assertSafeFilename(filename)
  const target = join(getInstanceRoot(instanceId), 'mods', filename)
  if (existsSync(target)) rmSync(target)
}

// Copies already-downloaded jar files directly instead of re-resolving them
// on Modrinth - callers (the UI) are responsible for only offering instances
// with a matching loader+version as targets, since a copied jar isn't
// re-validated for compatibility the way a fresh install would be.
export function copyMods(sourceInstanceId: string, targetInstanceId: string, filenames: string[]): void {
  const sourceDir = join(getInstanceRoot(sourceInstanceId), 'mods')
  const targetDir = join(getInstanceRoot(targetInstanceId), 'mods')
  mkdirSync(targetDir, { recursive: true })
  for (const filename of filenames) {
    assertSafeFilename(filename)
    const src = join(sourceDir, filename)
    if (!existsSync(src)) continue
    copyFileSync(src, join(targetDir, filename))
  }
}

export function registerModHandlers(): void {
  ipcMain.handle('mods:search', (_event, query: string, mcVersion: string, loader: string) =>
    searchMods(query, mcVersion, loader)
  )
  ipcMain.handle('mods:versions', (_event, projectId: string, mcVersion: string, loader: string) =>
    listModVersions(projectId, mcVersion, loader)
  )
  ipcMain.handle(
    'mods:dependencies',
    (_event, projectId: string, mcVersion: string, loader: string) =>
      getRequiredDependencies(projectId, mcVersion, loader)
  )
  ipcMain.handle('mods:install', (_event, instanceId: string, file: ModFileRef) =>
    installMod(instanceId, file)
  )
  ipcMain.handle('mods:list', (_event, instanceId: string) => listInstalledMods(instanceId))
  ipcMain.handle('mods:remove', (_event, instanceId: string, filename: string) =>
    removeMod(instanceId, filename)
  )
  ipcMain.handle(
    'mods:copyTo',
    (_event, sourceInstanceId: string, targetInstanceId: string, filenames: string[]) =>
      copyMods(sourceInstanceId, targetInstanceId, filenames)
  )
}
