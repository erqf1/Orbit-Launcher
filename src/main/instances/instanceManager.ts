import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { installFabricProfile } from '../loaders/fabric'
import { installQuiltProfile } from '../loaders/quilt'

export type LoaderType = 'vanilla' | 'fabric' | 'quilt'

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion: string | null
  // The `version.custom` id MCLC should launch with for fabric/quilt
  // instances (e.g. "fabric-loader-0.19.5-1.21.1"). Null for vanilla.
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

export interface CreateInstanceInput {
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
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

  let customVersionId: string | null = null
  try {
    if (input.loader === 'fabric' || input.loader === 'quilt') {
      if (!input.loaderVersion) {
        throw new Error('Bitte eine Loader-Version auswählen.')
      }
      customVersionId =
        input.loader === 'fabric'
          ? await installFabricProfile(root, input.mcVersion, input.loaderVersion)
          : await installQuiltProfile(root, input.mcVersion, input.loaderVersion)
    }
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
    customVersionId,
    memoryMin: '2G',
    memoryMax: '4G',
    javaPath: null,
    windowWidth: null,
    windowHeight: null,
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
  ipcMain.handle('instances:updateSettings', (_event, id: string, patch: InstanceSettingsPatch) =>
    updateInstanceSettings(id, patch)
  )
}
