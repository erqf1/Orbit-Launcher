import { fetchMavenVersions, downloadInstaller, type LoaderVersionSummary } from './forgeLike'

const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'

// Forge's version strings are "<mcVersion>-<forgeVersion>" with the exact
// Minecraft version embedded verbatim before the first hyphen (confirmed
// live against the real maven-metadata.xml - Forge kept this convention
// even after Mojang renamed its own versioning scheme, e.g. "26.1.2-64.0.14"
// alongside older "1.20.1-47.4.22" entries), so filtering is a plain prefix
// match with no era-specific parsing needed.
let cachedVersions: string[] | null = null
async function allForgeVersions(): Promise<string[]> {
  if (!cachedVersions) cachedVersions = await fetchMavenVersions(`${FORGE_MAVEN}/maven-metadata.xml`)
  return cachedVersions
}

export async function listForgeLoaderVersions(mcVersion: string): Promise<LoaderVersionSummary[]> {
  const all = await allForgeVersions()
  const prefix = `${mcVersion}-`
  return all
    .filter((v) => v.startsWith(prefix))
    .map((v) => ({ version: v.slice(prefix.length), stable: true }))
    .reverse()
}

export async function installForgeProfile(
  instanceRoot: string,
  mcVersion: string,
  forgeVersion: string
): Promise<string> {
  const full = `${mcVersion}-${forgeVersion}`
  const filename = `forge-${full}-installer.jar`
  const url = `${FORGE_MAVEN}/${full}/${filename}`
  return downloadInstaller(instanceRoot, url, filename)
}
