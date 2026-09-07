import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { installFabricProfile } from '../loaders/fabric'
import { installQuiltProfile } from '../loaders/quilt'
import { installLegacyFabricProfile } from '../loaders/legacyfabric'
import { installForgeProfile } from '../loaders/forge'
import { installNeoForgeProfile } from '../loaders/neoforge'

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'legacyfabric' | 'forge' | 'neoforge'

export interface Instance {
  id: string
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

export function getInstanceRoot(id: string): string {
  return join(app.getPath('userData'), 'instances', id)
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
  const root = getInstanceRoot(id)
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
    name: input.name,
    mcVersion: input.mcVersion,
    loader: input.loader,
    loaderVersion: input.loaderVersion ?? null,
    customVersionId: loaderInstall.customVersionId,
    forgeInstallerPath: loaderInstall.forgeInstallerPath,
    memoryMin: '2G',
    memoryMax: '4G',
    javaPath: null,
    jvmArgs: null,
    mcArgs: null,
    windowWidth: null,
    windowHeight: null,
    fullscreen: false,
    closeOnLaunch: false,
    autoJoinServer: null,
    createdAt: new Date().toISOString(),
    lastPlayed: null
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
  writeAll(readAll().filter((instance) => instance.id !== id))
  rmSync(getInstanceRoot(id), { recursive: true, force: true })
}

// Copies the source instance's already-installed files (including any
// fabric/quilt profile json) rather than reinstalling the loader, so
// cloning needs no network access and always matches the source exactly.
export function cloneInstance(id: string): Instance {
  const source = getInstance(id)
  if (!source) throw new Error('Instanz nicht gefunden.')

  const clone: Instance = {
    ...source,
    id: randomUUID(),
    name: `${source.name} (Kopie)`,
    createdAt: new Date().toISOString(),
    lastPlayed: null
  }

  cpSync(getInstanceRoot(source.id), getInstanceRoot(clone.id), { recursive: true, force: true })

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
  const root = getInstanceRoot(newId)
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
  ipcMain.handle('instances:updateSettings', (_event, id: string, patch: InstanceSettingsPatch) =>
    updateInstanceSettings(id, patch)
  )
}
