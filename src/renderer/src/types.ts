// Local view-layer copies of the shapes preload exposes on window.api.
// Kept separate from src/preload so the renderer's TS project doesn't have
// to reach across into preload's project.

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: 'vanilla'
  memoryMin: string
  memoryMax: string
  createdAt: string
  lastPlayed: string | null
}

export interface MinecraftVersionSummary {
  id: string
  type: string
  releaseTime: string
}
