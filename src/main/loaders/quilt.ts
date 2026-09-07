import { listLoaderVersions, installFabricLikeProfile, LoaderVersionSummary } from './fabricLike'

const QUILT_META = 'https://meta.quiltmc.org/v3'

export function listQuiltLoaderVersions(mcVersion: string): Promise<LoaderVersionSummary[]> {
  return listLoaderVersions(QUILT_META, mcVersion)
}

export function installQuiltProfile(
  instanceRoot: string,
  mcVersion: string,
  loaderVersion: string
): Promise<string> {
  return installFabricLikeProfile(QUILT_META, instanceRoot, mcVersion, loaderVersion)
}
