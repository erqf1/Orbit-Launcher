import { fetchMavenVersions, downloadInstaller, type LoaderVersionSummary } from './forgeLike'

const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'

let cachedVersions: string[] | null = null
async function allNeoForgeVersions(): Promise<string[]> {
  if (!cachedVersions) {
    cachedVersions = await fetchMavenVersions(`${NEOFORGE_MAVEN}/maven-metadata.xml`)
  }
  return cachedVersions
}

// Unlike Forge's "<mcVersion>-<build>", NeoForge's version strings are
// "<mcVersionPrefix>.<build>" with no delimiter distinguishing the two parts
// other than "the build is the last dot-segment" - so recovering which
// Minecraft version a NeoForge version belongs to means comparing what's
// left after stripping that segment. Verified live against the real
// maven-metadata.xml across both eras: older versions drop Minecraft's
// leading "1." (e.g. NeoForge "21.1.249" -> MC "1.21.1"), while versions
// released after Mojang's mid-2026 rename of its own version scheme (e.g.
// MC "26.1.2", "26.2") either match directly ("26.1.2.107") or get padded
// with a ".0" when MC's id has no patch segment ("26.2.0.80" for MC "26.2").
// Trying all three candidate forms covers both eras without hardcoding a
// cutoff version.
function candidatePrefixes(mcVersion: string): string[] {
  const candidates = new Set<string>([mcVersion, `${mcVersion}.0`])
  if (mcVersion.startsWith('1.')) candidates.add(mcVersion.slice(2))
  return [...candidates]
}

function baseOf(fullVersion: string): string {
  return fullVersion.slice(0, fullVersion.lastIndexOf('.'))
}

export async function listNeoForgeLoaderVersions(mcVersion: string): Promise<LoaderVersionSummary[]> {
  const all = await allNeoForgeVersions()
  const candidates = new Set(candidatePrefixes(mcVersion))
  return all
    .filter((v) => candidates.has(baseOf(v)))
    .map((v) => ({ version: v, stable: true }))
    .reverse()
}

// The loaderVersion here is already the full NeoForge version string (e.g.
// "26.1.2.107") rather than a short suffix like Forge's - it isn't cleanly
// decomposable the way Forge's hyphen-joined scheme is, so the UI shows the
// real version string as-is instead of a fabricated shorter one.
export async function installNeoForgeProfile(
  instanceRoot: string,
  neoForgeVersion: string
): Promise<string> {
  const filename = `neoforge-${neoForgeVersion}-installer.jar`
  const url = `${NEOFORGE_MAVEN}/${neoForgeVersion}/${filename}`
  return downloadInstaller(instanceRoot, url, filename)
}
