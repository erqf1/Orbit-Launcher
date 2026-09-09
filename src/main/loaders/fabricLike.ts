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

interface FabricLikeLibrary {
  name: string
  url?: string
  // Old Mojang-style per-OS native declaration (classifier suffix per
  // platform) - used by e.g. Legacy Fabric's lwjgl-platform entries for
  // very old Minecraft versions. MCLC's custom-profile downloader
  // (downloadToDirectory in its handler.js) only ever reads a library's
  // plain `name`/`url` and has no idea this field exists, so it guesses a
  // bare "<artifact>-<version>.jar" filename - which 404s, since libraries
  // declared this way only ever publish classified jars (there's no
  // unclassified one on the server at all). Only MCLC's getNatives() (for
  // *vanilla* libraries only) understands the modern equivalent,
  // downloads.classifiers - so profile libraries never benefit from it.
  natives?: Record<string, string>
  [key: string]: unknown
}

interface FabricLikeProfile {
  id: string
  mainClass: string
  libraries?: FabricLikeLibrary[]
  [key: string]: unknown
}

function currentNativesOs(): 'windows' | 'linux' | 'osx' {
  if (process.platform === 'darwin') return 'osx'
  if (process.platform === 'linux') return 'linux'
  return 'windows'
}

// Rewrites any library using the legacy natives-map format into a plain
// Maven coordinate with an explicit classifier segment
// (group:artifact:version:natives-windows) - downloadToDirectory's own
// fallback naming already handles a 4-part name correctly, so this is
// enough to make it fetch the real, existing classified jar instead of
// guessing a bare filename that was never published.
function resolveLegacyNatives(libraries: FabricLikeLibrary[]): void {
  const os = currentNativesOs()
  for (const lib of libraries) {
    if (!lib.natives || lib.downloads) continue
    const classifier = lib.natives[os]
    if (!classifier) continue
    lib.name = `${lib.name}:${classifier}`
    delete lib.natives
  }
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

interface FabricLikeInstallerEntry {
  url: string
  maven: string
  version: string
  stable: boolean
}

// The installer version is only needed to build the server-jar download URL
// (/versions/loader/<mc>/<loader>/<installer>/server/jar) - the client path
// never needed one, since installFabricLikeProfile only writes a version
// profile for MCLC to merge itself. Always takes the newest stable release;
// there's no reason a server install would want an unstable installer.
export async function getStableInstallerVersion(metaBaseUrl: string): Promise<string> {
  const res = await fetch(`${metaBaseUrl}/versions/installer`)
  if (!res.ok) {
    throw new Error(`Installer-Versionsliste konnte nicht geladen werden (HTTP ${res.status}).`)
  }
  const entries = (await res.json()) as FabricLikeInstallerEntry[]
  const stable = entries.find((e) => e.stable) ?? entries[0]
  if (!stable) throw new Error('Keine Installer-Version gefunden.')
  return stable.version
}

// Unlike the client path, Fabric's server endpoint hands back one complete,
// directly-launchable fat jar - no version-profile-json merging with MCLC's
// own vanilla library download needed, since the server never goes through
// MCLC at all (it's launched via plain child_process.spawn).
export async function downloadFabricLikeServerJar(
  metaBaseUrl: string,
  destDir: string,
  mcVersion: string,
  loaderVersion: string,
  installerVersion: string
): Promise<string> {
  const url = `${metaBaseUrl}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`
  const res = await fetch(url)
  if (!res.ok) {
    throw new Error(`Server-Jar konnte nicht geladen werden (HTTP ${res.status}).`)
  }
  mkdirSync(destDir, { recursive: true })
  const dest = join(destDir, 'server.jar')
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
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
  resolveLegacyNatives(profile.libraries ?? [])

  const versionDir = join(instanceRoot, 'versions', profile.id)
  mkdirSync(versionDir, { recursive: true })
  writeFileSync(join(versionDir, `${profile.id}.json`), JSON.stringify(profile, null, 2), 'utf-8')

  return profile.id
}
