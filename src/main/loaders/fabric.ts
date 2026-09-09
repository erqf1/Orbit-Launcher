import {
  listLoaderVersions,
  installFabricLikeProfile,
  getStableInstallerVersion,
  downloadFabricLikeServerJar,
  LoaderVersionSummary
} from './fabricLike'

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

export function getFabricStableInstallerVersion(): Promise<string> {
  return getStableInstallerVersion(FABRIC_META)
}

export function downloadFabricServerJar(
  destDir: string,
  mcVersion: string,
  loaderVersion: string,
  installerVersion: string
): Promise<string> {
  return downloadFabricLikeServerJar(FABRIC_META, destDir, mcVersion, loaderVersion, installerVersion)
}
