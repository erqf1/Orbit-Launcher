import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

// Fabric and Quilt both expose a "meta" API with the same shape (Quilt is a
// deliberately API-compatible fork), so both loaders share this logic and
// only differ in which base URL they hit.

export interface LoaderVersionSummary {
  version: string
  stable: boolean
}

interface FabricLikeLoaderEntry {
  loader: { version: string; stable: boolean }
}

interface FabricLikeProfile {
  id: string
  mainClass: string
  [key: string]: unknown
}

export async function listLoaderVersions(
  metaBaseUrl: string,
  mcVersion: string
): Promise<LoaderVersionSummary[]> {
  const res = await fetch(`${metaBaseUrl}/versions/loader/${encodeURIComponent(mcVersion)}`)
  if (!res.ok) {
    throw new Error(`Loader-Versionsliste konnte nicht geladen werden (HTTP ${res.status}).`)
  }
  const entries = (await res.json()) as FabricLikeLoaderEntry[]
  return entries.map((entry) => ({ version: entry.loader.version, stable: entry.loader.stable }))
}

// Writes the loader's ready-to-launch version profile (a Mojang-version-json
// shaped file with its own mainClass + libraries) to <instanceRoot>/versions/<id>/<id>.json,
// matching exactly where MCLC's `version.custom` option expects to find it.
// MCLC downloads the vanilla jar/libraries/assets itself via `version.number`
// and accumulates them with this profile's libraries - we don't need to
// merge anything or resolve the profile's `inheritsFrom` ourselves.
export async function installFabricLikeProfile(
  metaBaseUrl: string,
  instanceRoot: string,
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  const res = await fetch(
    `${metaBaseUrl}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  )
  if (!res.ok) {
    throw new Error(`Loader-Profil konnte nicht geladen werden (HTTP ${res.status}).`)
  }
  const profile = (await res.json()) as FabricLikeProfile

  const versionDir = join(instanceRoot, 'versions', profile.id)
  mkdirSync(versionDir, { recursive: true })
  writeFileSync(join(versionDir, `${profile.id}.json`), JSON.stringify(profile, null, 2), 'utf-8')

  return profile.id
}
