import { ipcMain } from 'electron'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
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
  }>
  const summaries: ModVersionSummary[] = []
  for (const v of versions) {
    const file = v.files.find((f) => f.primary) ?? v.files[0]
    if (file) summaries.push({ id: v.id, versionNumber: v.version_number, filename: file.filename, url: file.url })
  }
  return summaries
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

export function registerModHandlers(): void {
  ipcMain.handle('mods:search', (_event, query: string, mcVersion: string, loader: string) =>
    searchMods(query, mcVersion, loader)
  )
  ipcMain.handle('mods:versions', (_event, projectId: string, mcVersion: string, loader: string) =>
    listModVersions(projectId, mcVersion, loader)
  )
  ipcMain.handle('mods:install', (_event, instanceId: string, file: ModFileRef) =>
    installMod(instanceId, file)
  )
  ipcMain.handle('mods:list', (_event, instanceId: string) => listInstalledMods(instanceId))
  ipcMain.handle('mods:remove', (_event, instanceId: string, filename: string) =>
    removeMod(instanceId, filename)
  )
}
