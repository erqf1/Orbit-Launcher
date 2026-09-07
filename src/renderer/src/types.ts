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
  windowWidth: number | null
  windowHeight: number | null
  createdAt: string
  lastPlayed: string | null
}

export interface InstanceSettingsPatch {
  memoryMin?: string
  memoryMax?: string
  javaPath?: string | null
  windowWidth?: number | null
  windowHeight?: number | null
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
