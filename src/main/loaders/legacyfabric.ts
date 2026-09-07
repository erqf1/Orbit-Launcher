import { listLoaderVersions, installFabricLikeProfile, LoaderVersionSummary } from './fabricLike'

// Legacy Fabric maintains loader support for old Minecraft versions mainline
// Fabric dropped - confirmed live that its meta API is byte-for-byte
// v2-compatible with meta.fabricmc.net (same /versions/loader/<mcVersion>
// and .../profile/json shapes), so it reuses fabricLike.ts unchanged and
// only differs in base URL.
const LEGACY_FABRIC_META = 'https://meta.legacyfabric.net/v2'

export function listLegacyFabricLoaderVersions(mcVersion: string): Promise<LoaderVersionSummary[]> {
  return listLoaderVersions(LEGACY_FABRIC_META, mcVersion)
}

export function installLegacyFabricProfile(
  instanceRoot: string,
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  return installFabricLikeProfile(LEGACY_FABRIC_META, instanceRoot, mcVersion, loaderVersion)
}
