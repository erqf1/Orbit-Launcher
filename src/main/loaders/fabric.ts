import { listLoaderVersions, installFabricLikeProfile, LoaderVersionSummary } from './fabricLike'

const FABRIC_META = 'https://meta.fabricmc.net/v2'

export function listFabricLoaderVersions(mcVersion: string): Promise<LoaderVersionSummary[]> {
  return listLoaderVersions(FABRIC_META, mcVersion)
}

export function installFabricProfile(
  instanceRoot: string,
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  return installFabricLikeProfile(FABRIC_META, instanceRoot, mcVersion, loaderVersion)
}
