import { ipcMain, dialog } from 'electron'
import { existsSync, readFileSync, readdirSync, cpSync } from 'fs'
import { join, relative, sep } from 'path'
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
import { refocusMainWindow } from '../windowFocus'

// Component uids as actually used in Prism's mmc-pack.json (verified against
// PrismLauncher source, launcher/minecraft/Component.cpp KNOWN_MODLOADERS).
// Note: that source has no separate uid for Legacy Fabric - Prism appears to
// treat it as a plain net.fabricmc.fabric-loader component, so an imported
// Legacy Fabric instance will be tagged 'fabric' here and its (very old)
// loader version simply won't resolve against mainline Fabric's meta API -
// reported per-instance like any other bad version/loader combo rather than
// silently imported wrong.
const LOADER_UIDS: Record<string, 'fabric' | 'quilt' | 'forge' | 'neoforge'> = {
  'net.fabricmc.fabric-loader': 'fabric',
  'org.quiltmc.quilt-loader': 'quilt',
  'net.minecraftforge': 'forge',
  'net.neoforged': 'neoforge'
}
const UNSUPPORTED_LOADER_UIDS: Record<string, string> = {
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

  // Copy the whole game folder wholesale rather than a hand-picked subfolder
  // allowlist, so anything Prism (or a mod) put there - crash-reports, logs,
  // options.txt, servers.dat, xaero waypoints, mod-specific data folders,
  // whatever - comes across too, not just the folders this app happened to
  // think of. The one exclusion is "versions": createInstance() already ran
  // above and wrote this app's own loader profile/installer under the new
  // instance's versions/ folder, and Prism's own version-file layout there
  // isn't compatible with (or needed by) MCLC anyway.
  const gameRoot = findGameRoot(instanceDir)
  if (gameRoot) {
    const destRoot = getInstanceRoot(instance.id)
    cpSync(gameRoot, destRoot, {
      recursive: true,
      force: true,
      filter: (src) => {
        const rel = relative(gameRoot, src)
        return rel !== 'versions' && !rel.startsWith(`versions${sep}`)
      }
    })
  }

  // Carry over settings Prism tracks per-instance. Memory/Java path/JVM args/
  // window size are gated behind Prism's own "Override*" flags (only set if
  // the user explicitly overrode the global default for this instance);
  // maximize/close-after-launch/join-server aren't gated by a separate
  // override flag in Prism's schema (confirmed against two real
  // instance.cfg files) - they're just always per-instance.
  const patch: InstanceSettingsPatch = {}
  if (cfg.OverrideMemory === 'true') {
    if (cfg.MinMemAlloc) patch.memoryMin = `${cfg.MinMemAlloc}M`
    if (cfg.MaxMemAlloc) patch.memoryMax = `${cfg.MaxMemAlloc}M`
  }
  if (cfg.OverrideJavaLocation === 'true' && cfg.JavaPath) {
    patch.javaPath = cfg.JavaPath
  }
  if (cfg.OverrideJavaArgs === 'true' && cfg.JvmArgs) {
    patch.jvmArgs = cfg.JvmArgs
  }
  if (cfg.OverrideWindow === 'true') {
    if (cfg.MinecraftWinWidth) patch.windowWidth = Number(cfg.MinecraftWinWidth)
    if (cfg.MinecraftWinHeight) patch.windowHeight = Number(cfg.MinecraftWinHeight)
  }
  if (cfg.LaunchMaximized === 'true') patch.fullscreen = true
  if (cfg.CloseAfterLaunch === 'true') patch.closeOnLaunch = true
  if (cfg.JoinServerOnLaunch === 'true' && cfg.JoinServerOnLaunchAddress) {
    patch.autoJoinServer = cfg.JoinServerOnLaunchAddress
  }
  if (cfg.notes) patch.notes = cfg.notes
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
    refocusMainWindow()
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
