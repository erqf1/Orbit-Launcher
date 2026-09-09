import { ipcMain } from 'electron'

export interface MinecraftVersionSummary {
  id: string
  type: string
  releaseTime: string
}

// The summary manifest entry also carries a `url` to that version's own,
// much larger metadata JSON (asset index, library list, and - what server
// hosting needs - the `downloads.server` field) - not modeled in
// MinecraftVersionSummary since the rest of the app never needed it before
// (MCLC resolves the client's own per-version JSON internally).
interface RawManifestEntry extends MinecraftVersionSummary {
  url: string
}

interface RawManifest {
  latest: { release: string; snapshot: string }
  versions: RawManifestEntry[]
}

interface ServerDownloadInfo {
  url: string
  sha1: string
  size: number
}

let cachedManifest: RawManifest | null = null

async function getManifest(): Promise<RawManifest> {
  if (cachedManifest) return cachedManifest
  const res = await fetch('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json')
  cachedManifest = (await res.json()) as RawManifest
  return cachedManifest
}

export async function listMinecraftVersions(): Promise<MinecraftVersionSummary[]> {
  const manifest = await getManifest()
  return manifest.versions
}

export async function getLatestReleaseVersion(): Promise<string> {
  const manifest = await getManifest()
  return manifest.latest.release
}

// The vanilla server jar's download URL/sha1/size, read off the per-version
// metadata JSON's `downloads.server` field (same shape as `downloads.client`,
// which MCLC resolves internally for the client path - this app never
// fetched the per-version JSON itself until server hosting needed it).
export async function getServerDownloadInfo(mcVersion: string): Promise<ServerDownloadInfo> {
  const manifest = await getManifest()
  const entry = manifest.versions.find((v) => v.id === mcVersion)
  if (!entry) throw new Error(`Minecraft-Version ${mcVersion} nicht gefunden.`)

  const res = await fetch(entry.url)
  if (!res.ok) throw new Error(`Versionsdaten konnten nicht geladen werden (HTTP ${res.status}).`)
  const data = (await res.json()) as { downloads?: { server?: ServerDownloadInfo } }
  if (!data.downloads?.server) {
    throw new Error(`Für Minecraft ${mcVersion} gibt es keinen offiziellen Server-Download.`)
  }
  return data.downloads.server
}

export function registerVersionHandlers(): void {
  ipcMain.handle('versions:list', () => listMinecraftVersions())
}
