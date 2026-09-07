import { ipcMain, dialog } from 'electron'
import { existsSync, readFileSync, readdirSync, cpSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import {
  createInstance,
  getInstance,
  getInstanceRoot,
  updateInstanceSettings,
  type Instance,
  type InstanceSettingsPatch,
  type LoaderType
} from '../instances/instanceManager'

// Component uids as actually used in Prism's mmc-pack.json (verified against
// PrismLauncher source, launcher/minecraft/Component.cpp KNOWN_MODLOADERS).
const LOADER_UIDS: Record<string, 'fabric' | 'quilt'> = {
  'net.fabricmc.fabric-loader': 'fabric',
  'org.quiltmc.quilt-loader': 'quilt'
}
const UNSUPPORTED_LOADER_UIDS: Record<string, string> = {
  'net.minecraftforge': 'Forge wird noch nicht unterstützt',
  'net.neoforged': 'NeoForge wird noch nicht unterstützt',
  'com.mumfrey.liteloader': 'LiteLoader wird nicht unterstützt'
}

interface MmcPackComponent {
  uid: string
  version?: string
}

interface MmcPack {
  components?: MmcPackComponent[]
}

export interface PrismInstanceSummary {
  folderName: string
  name: string
  mcVersion: string | null
  loader: LoaderType | 'unsupported'
  loaderVersion: string | null
  unsupportedReason: string | null
}

function defaultPrismInstanceRoots(): string[] {
  const roots: string[] = []
  if (process.platform === 'win32') {
    const appData = process.env.APPDATA
    if (appData) roots.push(join(appData, 'PrismLauncher', 'instances'))
  } else if (process.platform === 'linux') {
    const home = homedir()
    roots.push(join(home, '.local/share/PrismLauncher/instances'))
    roots.push(join(home, '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances'))
  } else if (process.platform === 'darwin') {
    roots.push(join(homedir(), 'Library/Application Support/PrismLauncher/instances'))
  }
  return roots
}

// instance.cfg is a plain key=value INI file (Qt QSettings::IniFormat) -
// no nested sections we care about, so a minimal line parser is enough.
function parseIni(content: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('[') || line.startsWith(';') || line.startsWith('#')) continue
    const idx = line.indexOf('=')
    if (idx === -1) continue
    result[line.slice(0, idx).trim()] = line.slice(idx + 1).trim()
  }
  return result
}

// Prism moved the default game folder from ".minecraft" to "minecraft"
// (no dot) at some point; ".minecraft" only remains as a fallback for
// instances that already had it. Check both, preferring the current name.
function findGameRoot(instanceDir: string): string | null {
  const minecraft = join(instanceDir, 'minecraft')
  const dotMinecraft = join(instanceDir, '.minecraft')
  if (existsSync(minecraft)) return minecraft
  if (existsSync(dotMinecraft)) return dotMinecraft
  return null
}

function readPack(instanceDir: string): MmcPack | null {
  const packPath = join(instanceDir, 'mmc-pack.json')
  if (!existsSync(packPath)) return null
  try {
    return JSON.parse(readFileSync(packPath, 'utf-8')) as MmcPack
  } catch {
    return null
  }
}

function summarizeInstance(root: string, folderName: string): PrismInstanceSummary | null {
  const instanceDir = join(root, folderName)
  const cfgPath = join(instanceDir, 'instance.cfg')
  if (!existsSync(cfgPath)) return null

  let cfg: Record<string, string> = {}
  try {
    cfg = parseIni(readFileSync(cfgPath, 'utf-8'))
  } catch {
    return null
  }

  const pack = readPack(instanceDir)
  let mcVersion: string | null = null
  let loader: PrismInstanceSummary['loader'] = 'vanilla'
  let loaderVersion: string | null = null
  let unsupportedReason: string | null = null

  for (const component of pack?.components ?? []) {
    if (component.uid === 'net.minecraft') {
      mcVersion = component.version ?? null
    } else if (component.uid in LOADER_UIDS) {
      loader = LOADER_UIDS[component.uid]
      loaderVersion = component.version ?? null
    } else if (component.uid in UNSUPPORTED_LOADER_UIDS) {
      loader = 'unsupported'
      unsupportedReason = UNSUPPORTED_LOADER_UIDS[component.uid]
    }
  }

  return {
    folderName,
    name: cfg.name || folderName,
    mcVersion,
    loader,
    loaderVersion,
    unsupportedReason
  }
}

export function listPrismInstances(rootOverride?: string): PrismInstanceSummary[] {
  const roots = rootOverride ? [rootOverride] : defaultPrismInstanceRoots()
  const summaries: PrismInstanceSummary[] = []

  for (const root of roots) {
    if (!existsSync(root)) continue
    let entries: string[]
    try {
      entries = readdirSync(root)
    } catch {
      continue
    }
    for (const folderName of entries) {
      const summary = summarizeInstance(root, folderName)
      if (summary) summaries.push(summary)
    }
  }

  return summaries
}

// Reuses the existing instance-creation pipeline (which knows how to fetch
// a proper MCLC-compatible loader profile) rather than trying to translate
// Prism's own "OneSixVersionFormat" version files - we only need the
// (mcVersion, loader, loaderVersion) triple out of mmc-pack.json, then copy
// the actual content (mods/saves/etc.) across separately.
export async function importPrismInstance(
  rootOverride: string | undefined,
  folderName: string
): Promise<Instance> {
  const roots = rootOverride ? [rootOverride] : defaultPrismInstanceRoots()
  let instanceDir: string | null = null
  for (const root of roots) {
    const candidate = join(root, folderName)
    if (existsSync(join(candidate, 'instance.cfg'))) {
      instanceDir = candidate
      break
    }
  }
  if (!instanceDir) throw new Error('Prism-Instanz nicht gefunden.')

  const cfg = parseIni(readFileSync(join(instanceDir, 'instance.cfg'), 'utf-8'))
  const pack = readPack(instanceDir)
  if (!pack) throw new Error('mmc-pack.json fehlt - keine gültige Prism-Instanz.')

  let mcVersion: string | null = null
  let loader: LoaderType = 'vanilla'
  let loaderVersion: string | undefined

  for (const component of pack.components ?? []) {
    if (component.uid === 'net.minecraft') {
      mcVersion = component.version ?? null
    } else if (component.uid in LOADER_UIDS) {
      loader = LOADER_UIDS[component.uid]
      loaderVersion = component.version
    } else if (component.uid in UNSUPPORTED_LOADER_UIDS) {
      throw new Error(UNSUPPORTED_LOADER_UIDS[component.uid])
    }
  }
  if (!mcVersion) throw new Error('Minecraft-Version konnte nicht ermittelt werden.')

  const instance = await createInstance({
    name: cfg.name || folderName,
    mcVersion,
    loader,
    loaderVersion
  })

  const gameRoot = findGameRoot(instanceDir)
  if (gameRoot) {
    const destRoot = getInstanceRoot(instance.id)
    for (const sub of ['mods', 'resourcepacks', 'shaderpacks', 'saves', 'config', 'screenshots']) {
      const src = join(gameRoot, sub)
      if (existsSync(src)) {
        cpSync(src, join(destRoot, sub), { recursive: true, force: true })
      }
    }
  }

  // Best-effort carry-over of memory/java/window overrides, only if Prism
  // actually had them set for this instance (the Override* gate keys).
  const patch: InstanceSettingsPatch = {}
  if (cfg.OverrideMemory === 'true') {
    if (cfg.MinMemAlloc) patch.memoryMin = `${cfg.MinMemAlloc}M`
    if (cfg.MaxMemAlloc) patch.memoryMax = `${cfg.MaxMemAlloc}M`
  }
  if (cfg.OverrideJavaLocation === 'true' && cfg.JavaPath) {
    patch.javaPath = cfg.JavaPath
  }
  if (cfg.OverrideWindow === 'true') {
    if (cfg.MinecraftWinWidth) patch.windowWidth = Number(cfg.MinecraftWinWidth)
    if (cfg.MinecraftWinHeight) patch.windowHeight = Number(cfg.MinecraftWinHeight)
  }
  if (Object.keys(patch).length > 0) {
    updateInstanceSettings(instance.id, patch)
  }

  return getInstance(instance.id) as Instance
}

export function registerPrismImportHandlers(): void {
  ipcMain.handle('prism:list', (_event, rootOverride?: string) => listPrismInstances(rootOverride))
  ipcMain.handle('prism:import', (_event, rootOverride: string | undefined, folderName: string) =>
    importPrismInstance(rootOverride, folderName)
  )
  ipcMain.handle('prism:browseFolder', async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
