import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getServerDownloadInfo } from '../versions/versionManifest'

const PAPER_API = 'https://fill.papermc.io/v3'

export async function downloadVanillaServerJar(destDir: string, mcVersion: string): Promise<string> {
  const info = await getServerDownloadInfo(mcVersion)
  const res = await fetch(info.url)
  if (!res.ok) throw new Error(`Server-Jar konnte nicht geladen werden (HTTP ${res.status}).`)
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, 'server.jar')
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}

interface PaperProjectResponse {
  versions: Record<string, string[]>
}

// Paper's old api.papermc.io/v2 API was fully sunset (confirmed live -
// returns {"ok":false,"error":"sunset"}), superseded by this fill.papermc.io/v3
// API - do not revert to v2, it no longer works at all.
//
// data.versions groups builds by family (e.g. "26.2": ["26.2","26.2-rc-2"],
// "1.21": [...,"1.21.11",...]) with no guaranteed family order - confirmed
// live that "26.2" (Paper's newest family) comes first. A plain
// Object.values(...).flat() therefore returned release candidates mixed in
// with stable releases, in an order where paperVersions[0] - used as this
// dialog's auto-selected default - was "26.2" regardless of what the user
// actually wanted. Filter to stable releases only (anything with a letter is
// a pre-release/RC channel marker) and sort newest-first so both the
// dropdown and the auto-picked default are meaningful.
export async function listPaperVersions(): Promise<string[]> {
  const res = await fetch(`${PAPER_API}/projects/paper`)
  if (!res.ok) throw new Error(`Paper-Versionsliste konnte nicht geladen werden (HTTP ${res.status}).`)
  const data = (await res.json()) as PaperProjectResponse
  const all = Object.values(data.versions).flat()
  const stable = all.filter((v) => !/[a-zA-Z]/.test(v))
  return stable.sort(compareMcVersionsDesc)
}

// Mojang's post-2026 scheme (e.g. "26.2") supersedes the old "1.x" scheme, so
// any non-"1.x" version sorts ahead of every "1.x" version; within a scheme,
// compare each dot-separated segment numerically.
function compareMcVersionsDesc(a: string, b: string): number {
  const aLegacy = a.startsWith('1.')
  const bLegacy = b.startsWith('1.')
  if (aLegacy !== bLegacy) return aLegacy ? 1 : -1
  const aParts = a.split('.').map(Number)
  const bParts = b.split('.').map(Number)
  for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
    const diff = (bParts[i] || 0) - (aParts[i] || 0)
    if (diff !== 0) return diff
  }
  return 0
}

export interface PaperBuildSummary {
  id: number
  time: string
  channel: string
}

interface PaperBuildEntry {
  id: number
  time: string
  channel: string
  downloads: Record<string, { name: string; url: string; size: number }>
}

// Builds come back newest-first - confirmed live, so builds[0] is always the
// latest for a version without needing a separate sort.
async function listPaperBuildEntries(mcVersion: string): Promise<PaperBuildEntry[]> {
  const res = await fetch(`${PAPER_API}/projects/paper/versions/${encodeURIComponent(mcVersion)}/builds`)
  if (!res.ok) throw new Error(`Paper-Builds konnten nicht geladen werden (HTTP ${res.status}).`)
  return (await res.json()) as PaperBuildEntry[]
}

export async function listPaperBuilds(mcVersion: string): Promise<PaperBuildSummary[]> {
  const entries = await listPaperBuildEntries(mcVersion)
  return entries.map((e) => ({ id: e.id, time: e.time, channel: e.channel }))
}

export async function downloadPaperServerJar(
  destDir: string,
  mcVersion: string,
  buildId?: number
): Promise<string> {
  const entries = await listPaperBuildEntries(mcVersion)
  const build = buildId ? entries.find((e) => e.id === buildId) : entries[0]
  if (!build) throw new Error(`Kein Paper-Build für Minecraft ${mcVersion} gefunden.`)
  const download = build.downloads['server:default']
  if (!download) throw new Error(`Paper-Build ${build.id} hat keinen Server-Download.`)

  const res = await fetch(download.url)
  if (!res.ok) throw new Error(`Server-Jar konnte nicht geladen werden (HTTP ${res.status}).`)
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, 'server.jar')
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}
