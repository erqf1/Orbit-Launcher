import { ipcMain } from 'electron'

export interface MinecraftVersionSummary {
  id: string
  type: string
  releaseTime: string
}

interface RawManifest {
  latest: { release: string; snapshot: string }
  versions: MinecraftVersionSummary[]
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

export function registerVersionHandlers(): void {
  ipcMain.handle('versions:list', () => listMinecraftVersions())
}
