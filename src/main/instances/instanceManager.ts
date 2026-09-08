import { ipcMain, app, shell, dialog } from 'electron'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  unlinkSync,
  chmodSync
} from 'fs'
import { join, extname } from 'path'
import { randomUUID } from 'crypto'
import { installFabricProfile } from '../loaders/fabric'
import { installQuiltProfile } from '../loaders/quilt'
import { installLegacyFabricProfile } from '../loaders/legacyfabric'
import { installForgeProfile } from '../loaders/forge'
import { installNeoForgeProfile } from '../loaders/neoforge'

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'legacyfabric' | 'forge' | 'neoforge'

export interface Instance {
  id: string
  // On-disk directory name under instances/ - human-readable (derived from
  // the name at creation time), decoupled from `id` so renaming the
  // instance doesn't require moving files, and pre-existing instances
  // (folderName absent from old instances.json entries) keep working via
  // the `id` fallback in getInstanceRoot.
  folderName?: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion: string | null
  // The `version.custom` id MCLC should launch with for fabric/quilt/
  // legacyfabric instances (e.g. "fabric-loader-0.19.5-1.21.1"). Null
  // otherwise.
  customVersionId: string | null
  // Local path to a downloaded installer jar for forge/neoforge instances,
  // passed as MCLC's `forge` launch option. Null otherwise.
  forgeInstallerPath: string | null
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
  notes: string
  // Filename of a custom icon inside the instance's own folder (e.g.
  // "icon.png"), or null for the default loader-colored card. Kept as
  // just a filename (not a full path) since the instance root itself can
  // move if folderName ever changes.
  iconFilename: string | null
  createdAt: string
  lastPlayed: string | null
  favorite: boolean
  // Free-text group name for the sidebar's user-defined groups (like the
  // loader filter, a group only shows up in the sidebar once at least one
  // instance is assigned to it - no separate "create empty group" flow).
  group: string | null
  // User-chosen hex color (e.g. "#5b9dff") for the card's cover art
  // gradient, or null to use the default per-loader color.
  coverColor: string | null
}

export interface InstanceSettingsPatch {
  favorite?: boolean
  group?: string | null
  coverColor?: string | null
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
  notes?: string
}

export interface CreateInstanceInput {
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
}

export interface CloneAsVersionInput {
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
}

interface LoaderInstallResult {
  customVersionId: string | null
  forgeInstallerPath: string | null
}

const NO_LOADER: LoaderInstallResult = { customVersionId: null, forgeInstallerPath: null }

async function installLoaderProfile(
  root: string,
  loader: LoaderType,
  mcVersion: string,
  loaderVersion: string | undefined
): Promise<LoaderInstallResult> {
  if (loader === 'vanilla') return NO_LOADER
  if (!loaderVersion) throw new Error('Bitte eine Loader-Version auswählen.')

  if (loader === 'fabric') {
    return { customVersionId: await installFabricProfile(root, mcVersion, loaderVersion), forgeInstallerPath: null }
  }
  if (loader === 'quilt') {
    return { customVersionId: await installQuiltProfile(root, mcVersion, loaderVersion), forgeInstallerPath: null }
  }
  if (loader === 'legacyfabric') {
    return {
      customVersionId: await installLegacyFabricProfile(root, mcVersion, loaderVersion),
      forgeInstallerPath: null
    }
  }
  if (loader === 'forge') {
    return { customVersionId: null, forgeInstallerPath: await installForgeProfile(root, mcVersion, loaderVersion) }
  }
  // neoforge
  return { customVersionId: null, forgeInstallerPath: await installNeoForgeProfile(root, loaderVersion) }
}

const SUBFOLDERS = ['mods', 'saves', 'resourcepacks', 'shaderpacks', 'config', 'screenshots']

function getInstancesFile(): string {
  return join(app.getPath('userData'), 'instances.json')
}

function sanitizeFolderName(name: string): string {
  // Windows-invalid filename characters plus leading/trailing dots/spaces
  // (Windows silently strips trailing dots/spaces, which can cause
  // mismatches later) - everything else (including spaces, unicode) is
  // left as-is to stay close to Prism's own "just use the name" approach.
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '')
  return cleaned || 'Instanz'
}

function uniqueFolderName(base: string, taken: Set<string>): string {
  let candidate = base
  let n = 2
  while (taken.has(candidate.toLowerCase())) {
    candidate = `${base} (${n})`
    n++
  }
  return candidate
}

export function getInstanceRoot(id: string): string {
  const instance = readAll().find((i) => i.id === id)
  const folderName = instance?.folderName ?? id
  return join(app.getPath('userData'), 'instances', folderName)
}

function readAll(): Instance[] {
  const file = getInstancesFile()
  if (!existsSync(file)) return []
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Instance[]
  } catch {
    return []
  }
}

function writeAll(instances: Instance[]): void {
  writeFileSync(getInstancesFile(), JSON.stringify(instances, null, 2), 'utf-8')
}

export function listInstances(): Instance[] {
  return readAll()
}

export function getInstance(id: string): Instance | undefined {
  return readAll().find((instance) => instance.id === id)
}

export async function createInstance(input: CreateInstanceInput): Promise<Instance> {
  const id = randomUUID()
  const existingFolders = new Set(readAll().map((i) => (i.folderName ?? i.id).toLowerCase()))
  const folderName = uniqueFolderName(sanitizeFolderName(input.name), existingFolders)
  const root = join(app.getPath('userData'), 'instances', folderName)
  for (const sub of SUBFOLDERS) {
    mkdirSync(join(root, sub), { recursive: true })
  }

  let loaderInstall: LoaderInstallResult
  try {
    loaderInstall = await installLoaderProfile(root, input.loader, input.mcVersion, input.loaderVersion)
  } catch (err) {
    // Don't leave an empty, untracked instance folder behind on disk if the
    // loader profile fetch fails (e.g. no internet, bad version/loader combo).
    rmSync(root, { recursive: true, force: true })
    throw err
  }

  const instance: Instance = {
    id,
    folderName,
    name: input.name,
    mcVersion: input.mcVersion,
    loader: input.loader,
    loaderVersion: input.loaderVersion ?? null,
    customVersionId: loaderInstall.customVersionId,
    forgeInstallerPath: loaderInstall.forgeInstallerPath,
    memoryMin: '512M',
    memoryMax: '4G',
    javaPath: null,
    jvmArgs: null,
    mcArgs: null,
    windowWidth: null,
    windowHeight: null,
    fullscreen: false,
    closeOnLaunch: false,
    autoJoinServer: null,
    notes: '',
    iconFilename: null,
    createdAt: new Date().toISOString(),
    lastPlayed: null,
    favorite: false,
    group: null,
    coverColor: null
  }

  const instances = readAll()
  instances.push(instance)
  writeAll(instances)
  return instance
}

export function renameInstance(id: string, name: string): Instance {
  const instances = readAll()
  const instance = instances.find((i) => i.id === id)
  if (!instance) throw new Error('Instanz nicht gefunden.')
  instance.name = name
  writeAll(instances)
  return instance
}

export function updateInstanceSettings(id: string, patch: InstanceSettingsPatch): Instance {
  const instances = readAll()
  const instance = instances.find((i) => i.id === id)
  if (!instance) throw new Error('Instanz nicht gefunden.')
  Object.assign(instance, patch)
  writeAll(instances)
  return instance
}

export function deleteInstance(id: string): void {
  const root = getInstanceRoot(id)
  writeAll(readAll().filter((instance) => instance.id !== id))
  rmSync(root, { recursive: true, force: true })
}

export function openInstanceFolder(id: string): Promise<void> {
  return shell.openPath(getInstanceRoot(id)).then((err) => {
    if (err) throw new Error(err)
  })
}

const ICON_MIME_BY_EXT: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp'
}

// Reads the instance's custom icon (if any) as a data: URL rather than
// exposing a file:// path to the renderer - simplest way to display it
// without touching the CSP's img-src, which the app deliberately leaves
// unset (default-src 'self') rather than opening up to arbitrary local
// paths.
export function getInstanceIconDataUrl(id: string): string | null {
  const instance = getInstance(id)
  if (!instance?.iconFilename) return null
  const filePath = join(getInstanceRoot(id), instance.iconFilename)
  if (!existsSync(filePath)) return null
  const mime = ICON_MIME_BY_EXT[extname(instance.iconFilename).toLowerCase()]
  if (!mime) return null
  return `data:${mime};base64,${readFileSync(filePath).toString('base64')}`
}

export async function setInstanceIcon(id: string): Promise<Instance> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Bild', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }]
  })
  if (result.canceled || result.filePaths.length === 0) {
    const instance = getInstance(id)
    if (!instance) throw new Error('Instanz nicht gefunden.')
    return instance
  }

  const instances = readAll()
  const instance = instances.find((i) => i.id === id)
  if (!instance) throw new Error('Instanz nicht gefunden.')

  const root = getInstanceRoot(id)
  const ext = extname(result.filePaths[0]).toLowerCase() || '.png'
  // Clear any previous icon with a different extension first, so switching
  // from a .png to a .jpg icon doesn't leave the old file behind forever.
  if (instance.iconFilename) {
    const oldPath = join(root, instance.iconFilename)
    if (existsSync(oldPath)) unlinkSync(oldPath)
  }
  const filename = `icon${ext}`
  cpSync(result.filePaths[0], join(root, filename))
  instance.iconFilename = filename
  writeAll(instances)
  return instance
}

// Creates a desktop shortcut that re-launches the app with a
// `--launch-instance=<id>` flag; index.ts reads that flag at startup and
// App.tsx auto-triggers the normal play flow once auth is restored, so the
// shortcut reuses the exact same launch path as clicking "Play" instead of
// duplicating any of that logic here. Windows-only via shell.writeShortcutLink
// (there's no Electron equivalent for other platforms); Linux gets a
// hand-written .desktop file instead. macOS isn't a build target yet.
export async function createDesktopShortcut(id: string): Promise<string> {
  const instance = getInstance(id)
  if (!instance) throw new Error('Instanz nicht gefunden.')

  const desktopDir = app.getPath('desktop')
  const baseName = sanitizeFolderName(instance.name)
  const execPath = process.execPath
  const launchFlag = `--launch-instance=${id}`
  // process.argv[1] is NOT a reliable way to find the entry script in dev -
  // confirmed broken in practice (electron-vite dev's actual argv layout
  // doesn't put it there, producing a shortcut whose Arguments resolved to
  // the Desktop folder itself instead of out/main/index.js, and Electron
  // then failed to find an app to load at all). app.getAppPath() is
  // Electron's own API for exactly this - the app root directory in both
  // dev (project root) and packaged (resources/app.asar) builds.
  const devEntryScript = join(app.getAppPath(), 'out', 'main', 'index.js')

  if (process.platform === 'win32') {
    const shortcutPath = join(desktopDir, `${baseName}.lnk`)
    const args = app.isPackaged ? launchFlag : `"${devEntryScript}" ${launchFlag}`
    const ok = shell.writeShortcutLink(shortcutPath, 'create', {
      target: execPath,
      args,
      description: `${instance.name} in Erqf Launcher starten`
    })
    if (!ok) throw new Error('Verknüpfung konnte nicht erstellt werden.')
    return shortcutPath
  }

  if (process.platform === 'linux') {
    const desktopFilePath = join(desktopDir, `${baseName}.desktop`)
    const execLine = app.isPackaged
      ? `"${execPath}" ${launchFlag}`
      : `"${execPath}" "${devEntryScript}" ${launchFlag}`
    const contents = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=${instance.name} (Erqf Launcher)`,
      `Exec=${execLine}`,
      'Terminal=false',
      'Categories=Game;'
    ].join('\n')
    writeFileSync(desktopFilePath, contents, 'utf-8')
    chmodSync(desktopFilePath, 0o755)
    return desktopFilePath
  }

  throw new Error('Desktop-Verknüpfungen werden auf diesem Betriebssystem nicht unterstützt.')
}

export function clearInstanceIcon(id: string): Instance {
  const instances = readAll()
  const instance = instances.find((i) => i.id === id)
  if (!instance) throw new Error('Instanz nicht gefunden.')
  if (instance.iconFilename) {
    const filePath = join(getInstanceRoot(id), instance.iconFilename)
    if (existsSync(filePath)) unlinkSync(filePath)
  }
  instance.iconFilename = null
  writeAll(instances)
  return instance
}

// Copies the source instance's already-installed files (including any
// fabric/quilt profile json) rather than reinstalling the loader, so
// cloning needs no network access and always matches the source exactly.
export function cloneInstance(id: string): Instance {
  const source = getInstance(id)
  if (!source) throw new Error('Instanz nicht gefunden.')

  const newId = randomUUID()
  const existingFolders = new Set(readAll().map((i) => (i.folderName ?? i.id).toLowerCase()))
  const folderName = uniqueFolderName(sanitizeFolderName(`${source.name} (Kopie)`), existingFolders)

  const clone: Instance = {
    ...source,
    id: newId,
    folderName,
    name: `${source.name} (Kopie)`,
    createdAt: new Date().toISOString(),
    lastPlayed: null
  }

  cpSync(getInstanceRoot(source.id), join(app.getPath('userData'), 'instances', folderName), {
    recursive: true,
    force: true
  })

  const instances = readAll()
  instances.push(clone)
  writeAll(instances)
  return clone
}

// Like cloneInstance, but targets a different Minecraft version/loader: the
// source's files (mods, saves, settings) are copied as a starting point, then
// a fresh loader profile is installed for the new version/loader combo. The
// caller resolves loaderVersion the same way instance creation does (list
// available loader versions for the target mcVersion, let the user pick).
export async function cloneInstanceAsVersion(
  id: string,
  input: CloneAsVersionInput
): Promise<Instance> {
  const source = getInstance(id)
  if (!source) throw new Error('Instanz nicht gefunden.')

  const newId = randomUUID()
  const existingFolders = new Set(readAll().map((i) => (i.folderName ?? i.id).toLowerCase()))
  const folderName = uniqueFolderName(
    sanitizeFolderName(`${source.name} (${input.mcVersion})`),
    existingFolders
  )
  const root = join(app.getPath('userData'), 'instances', folderName)
  cpSync(getInstanceRoot(source.id), root, { recursive: true, force: true })

  let loaderInstall: LoaderInstallResult
  try {
    loaderInstall = await installLoaderProfile(root, input.loader, input.mcVersion, input.loaderVersion)
  } catch (err) {
    rmSync(root, { recursive: true, force: true })
    throw err
  }

  const clone: Instance = {
    ...source,
    id: newId,
    folderName,
    name: `${source.name} (${input.mcVersion})`,
    mcVersion: input.mcVersion,
    loader: input.loader,
    loaderVersion: input.loaderVersion ?? null,
    customVersionId: loaderInstall.customVersionId,
    forgeInstallerPath: loaderInstall.forgeInstallerPath,
    createdAt: new Date().toISOString(),
    lastPlayed: null
  }

  const instances = readAll()
  instances.push(clone)
  writeAll(instances)
  return clone
}

// Changes an existing instance's Minecraft version/loader *in place* (same
// id, same folder, same mods/saves) rather than creating a copy - used by
// the "change version" flow, which then separately tries to re-resolve
// each currently-installed mod for the new version (see mods/migrate.ts)
// since old-version mod jars are very likely incompatible.
export async function changeInstanceVersion(id: string, input: CloneAsVersionInput): Promise<Instance> {
  const instances = readAll()
  const instance = instances.find((i) => i.id === id)
  if (!instance) throw new Error('Instanz nicht gefunden.')

  const root = getInstanceRoot(id)
  const loaderInstall = await installLoaderProfile(root, input.loader, input.mcVersion, input.loaderVersion)

  instance.mcVersion = input.mcVersion
  instance.loader = input.loader
  instance.loaderVersion = input.loaderVersion ?? null
  instance.customVersionId = loaderInstall.customVersionId
  instance.forgeInstallerPath = loaderInstall.forgeInstallerPath
  writeAll(instances)
  return instance
}

export function markLaunched(id: string): void {
  const instances = readAll()
  const instance = instances.find((i) => i.id === id)
  if (!instance) return
  instance.lastPlayed = new Date().toISOString()
  writeAll(instances)
}

export function registerInstanceHandlers(): void {
  ipcMain.handle('instances:list', () => listInstances())
  ipcMain.handle('instances:create', (_event, input: CreateInstanceInput) => createInstance(input))
  ipcMain.handle('instances:rename', (_event, id: string, name: string) => renameInstance(id, name))
  ipcMain.handle('instances:delete', (_event, id: string) => deleteInstance(id))
  ipcMain.handle('instances:clone', (_event, id: string) => cloneInstance(id))
  ipcMain.handle('instances:cloneAsVersion', (_event, id: string, input: CloneAsVersionInput) =>
    cloneInstanceAsVersion(id, input)
  )
  ipcMain.handle('instances:changeVersion', (_event, id: string, input: CloneAsVersionInput) =>
    changeInstanceVersion(id, input)
  )
  ipcMain.handle('instances:updateSettings', (_event, id: string, patch: InstanceSettingsPatch) =>
    updateInstanceSettings(id, patch)
  )
  ipcMain.handle('instances:openFolder', (_event, id: string) => openInstanceFolder(id))
  ipcMain.handle('instances:getIconDataUrl', (_event, id: string) => getInstanceIconDataUrl(id))
  ipcMain.handle('instances:setIcon', (_event, id: string) => setInstanceIcon(id))
  ipcMain.handle('instances:clearIcon', (_event, id: string) => clearInstanceIcon(id))
  ipcMain.handle('instances:createShortcut', (_event, id: string) => createDesktopShortcut(id))
}
