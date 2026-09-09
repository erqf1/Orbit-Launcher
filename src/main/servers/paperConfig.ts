import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { Document, parseDocument } from 'yaml'
import { getServerRoot } from './serverManager'

export type PaperConfigValue = string | number | boolean

// Paper's own config files run to hundreds of keys across dozens of nested
// sections (verified live against a real booted 1.21 server's
// config/paper-global.yml and config/paper-world-defaults.yml) - same
// "curated subset, not a generic editor" scoping call as
// ServerPropertiesTab.tsx made for server.properties. This registry is the
// single source of truth for which keys the structured UI exposes; the
// FileConfigBrowser-based raw view (still reachable via the tab's "Raw
// Files" toggle) covers anything not listed here.
export type PaperConfigFile = 'global' | 'worldDefaults'

export interface PaperConfigField {
  key: string
  file: PaperConfigFile
  // Dot-separated path into the YAML document, e.g. 'chunks.max-auto-save-chunks-per-tick'.
  path: string
  default: PaperConfigValue
}

export const PAPER_CONFIG_FIELDS: PaperConfigField[] = [
  // Performance
  { key: 'chunkSendRate', file: 'global', path: 'chunk-loading-basic.player-max-chunk-send-rate', default: 75.0 },
  { key: 'chunkLoadRate', file: 'global', path: 'chunk-loading-basic.player-max-chunk-load-rate', default: 100.0 },
  { key: 'ioThreads', file: 'global', path: 'chunk-system.io-threads', default: -1 },
  { key: 'workerThreads', file: 'global', path: 'chunk-system.worker-threads', default: -1 },
  {
    key: 'maxAutoSaveChunksPerTick',
    file: 'worldDefaults',
    path: 'chunks.max-auto-save-chunks-per-tick',
    default: 24
  },
  { key: 'tickRateMobSpawner', file: 'worldDefaults', path: 'tick-rates.mob-spawner', default: 1 },
  { key: 'tickRateContainerUpdate', file: 'worldDefaults', path: 'tick-rates.container-update', default: 1 },

  // Mobs & spawning
  { key: 'spawnLimitMonster', file: 'worldDefaults', path: 'entities.spawning.spawn-limits.monster', default: -1 },
  { key: 'spawnLimitCreature', file: 'worldDefaults', path: 'entities.spawning.spawn-limits.creature', default: -1 },
  { key: 'spawnLimitAmbient', file: 'worldDefaults', path: 'entities.spawning.spawn-limits.ambient', default: -1 },
  {
    key: 'spawnLimitWaterAmbient',
    file: 'worldDefaults',
    path: 'entities.spawning.spawn-limits.water_ambient',
    default: -1
  },
  { key: 'maxEntityCollisions', file: 'worldDefaults', path: 'collisions.max-entity-collisions', default: 8 },
  { key: 'antiXrayEnabled', file: 'worldDefaults', path: 'anticheat.anti-xray.enabled', default: false },
  { key: 'antiXrayEngineMode', file: 'worldDefaults', path: 'anticheat.anti-xray.engine-mode', default: 1 },

  // Gameplay
  {
    key: 'disableExplosionKnockback',
    file: 'worldDefaults',
    path: 'environment.disable-explosion-knockback',
    default: false
  },
  { key: 'disableIceAndSnow', file: 'worldDefaults', path: 'environment.disable-ice-and-snow', default: false },
  { key: 'disableThunder', file: 'worldDefaults', path: 'environment.disable-thunder', default: false },
  { key: 'hopperCooldownWhenFull', file: 'worldDefaults', path: 'hopper.cooldown-when-full', default: true },
  { key: 'hopperIgnoreOccludingBlocks', file: 'worldDefaults', path: 'hopper.ignore-occluding-blocks', default: false },
  { key: 'lootablesAutoReplenish', file: 'worldDefaults', path: 'lootables.auto-replenish', default: false },
  { key: 'redstoneImplementation', file: 'worldDefaults', path: 'misc.redstone-implementation', default: 'VANILLA' },
  { key: 'fishingTimeMin', file: 'worldDefaults', path: 'fishing-time-range.minimum', default: 100 },
  { key: 'fishingTimeMax', file: 'worldDefaults', path: 'fishing-time-range.maximum', default: 600 },

  // Network
  { key: 'velocityEnabled', file: 'global', path: 'proxies.velocity.enabled', default: false },
  { key: 'velocityOnlineMode', file: 'global', path: 'proxies.velocity.online-mode', default: true },
  { key: 'velocitySecret', file: 'global', path: 'proxies.velocity.secret', default: '' },
  { key: 'bungeeCordOnlineMode', file: 'global', path: 'proxies.bungee-cord.online-mode', default: true },
  { key: 'updateCheckerEnabled', file: 'global', path: 'update-checker.enabled', default: true }
]

function configFilePath(id: string, file: PaperConfigFile): string {
  const name = file === 'global' ? 'paper-global.yml' : 'paper-world-defaults.yml'
  return join(getServerRoot(id), 'config', name)
}

function loadDoc(file: string): Document {
  if (!existsSync(file)) return new Document({})
  return parseDocument(readFileSync(file, 'utf-8'))
}

// Reads every registered field regardless of which of the two files it
// lives in, keyed by the field's own `key` (not its YAML path) - the
// renderer shouldn't need to know or care that this is backed by two
// separate files.
export function readPaperConfig(id: string): Record<string, PaperConfigValue> {
  const docs = new Map<PaperConfigFile, Document>()
  const result: Record<string, PaperConfigValue> = {}
  for (const field of PAPER_CONFIG_FIELDS) {
    if (!docs.has(field.file)) docs.set(field.file, loadDoc(configFilePath(id, field.file)))
    const value = docs.get(field.file)!.getIn(field.path.split('.'))
    result[field.key] = (value === undefined ? field.default : value) as PaperConfigValue
  }
  return result
}

// Patches only the given fields, preserving every other key, comment, and
// section Paper itself writes into these files - same "never discard what
// we don't understand" discipline as serverProperties.ts's writeServerProperties,
// made easy here by the `yaml` package's comment-preserving Document API
// (verified live: setIn() both auto-creates missing intermediate sections
// and leaves untouched sibling keys/comments exactly as they were).
export function writePaperConfig(id: string, patch: Record<string, PaperConfigValue>): void {
  const byFile = new Map<PaperConfigFile, Document>()
  const filesTouched = new Set<PaperConfigFile>()

  for (const [key, value] of Object.entries(patch)) {
    const field = PAPER_CONFIG_FIELDS.find((f) => f.key === key)
    if (!field) continue
    if (!byFile.has(field.file)) byFile.set(field.file, loadDoc(configFilePath(id, field.file)))
    byFile.get(field.file)!.setIn(field.path.split('.'), value)
    filesTouched.add(field.file)
  }

  for (const file of filesTouched) {
    writeFileSync(configFilePath(id, file), byFile.get(file)!.toString(), 'utf-8')
  }
}

export function registerPaperConfigHandlers(): void {
  ipcMain.handle('servers:hostPaperConfigRead', (_event, id: string) => readPaperConfig(id))
  ipcMain.handle('servers:hostPaperConfigWrite', (_event, id: string, patch: Record<string, PaperConfigValue>) =>
    writePaperConfig(id, patch)
  )
}
