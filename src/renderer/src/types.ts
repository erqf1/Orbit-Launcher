// Local view-layer copies of the shapes preload exposes on window.api.
// Kept separate from src/preload so the renderer's TS project doesn't have
// to reach across into preload's project.

export type LoaderType = 'vanilla' | 'fabric' | 'quilt'

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion: string | null
  customVersionId: string | null
  memoryMin: string
  memoryMax: string
  javaPath: string | null
  jvmArgs: string | null
  mcArgs: string | null
  windowWidth: number | null
  windowHeight: number | null
  fullscreen: boolean
  closeOnLaunch: boolean
  autoJoinServer: string | null
  createdAt: string
  lastPlayed: string | null
}

export interface InstanceSettingsPatch {
  memoryMin?: string
  memoryMax?: string
  javaPath?: string | null
  jvmArgs?: string | null
  mcArgs?: string | null
  windowWidth?: number | null
  windowHeight?: number | null
  fullscreen?: boolean
  closeOnLaunch?: boolean
  autoJoinServer?: string | null
}

export interface CloneAsVersionInput {
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
}

export interface LaunchLogEvent {
  launchId: string
  instanceId: string
  line: string
}

export interface LaunchClosedEvent {
  launchId: string
  instanceId: string
  code: number
}

export interface JavaInstallation {
  path: string
  version: string
}

export interface MinecraftVersionSummary {
  id: string
  type: string
  releaseTime: string
}

export interface LoaderVersionSummary {
  version: string
  stable: boolean
}

export interface ModSearchResult {
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl: string | null
  downloads: number
}

export interface ModVersionSummary {
  id: string
  versionNumber: string
  filename: string
  url: string
  requiredDependencyProjectIds: string[]
}

export interface CuratedMod extends ModSearchResult {
  category: string
  compatible: boolean
}

export interface PrismInstanceSummary {
  folderName: string
  name: string
  mcVersion: string | null
  loader: LoaderType | 'unsupported'
  loaderVersion: string | null
  unsupportedReason: string | null
}
