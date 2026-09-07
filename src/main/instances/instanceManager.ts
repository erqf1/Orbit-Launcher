import { ipcMain, app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, cpSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

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

export interface CreateInstanceInput {
  name: string
  mcVersion: string
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

export function createInstance(input: CreateInstanceInput): Instance {
  const instance: Instance = {
    id: randomUUID(),
    name: input.name,
    mcVersion: input.mcVersion,
    loader: 'vanilla',
    memoryMin: '2G',
    memoryMax: '4G',
    createdAt: new Date().toISOString(),
    lastPlayed: null
  }

  const root = getInstanceRoot(instance.id)
  for (const sub of SUBFOLDERS) {
    mkdirSync(join(root, sub), { recursive: true })
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

export function deleteInstance(id: string): void {
  writeAll(readAll().filter((instance) => instance.id !== id))
  rmSync(getInstanceRoot(id), { recursive: true, force: true })
}

export function cloneInstance(id: string): Instance {
  const source = getInstance(id)
  if (!source) throw new Error('Instanz nicht gefunden.')
  const clone = createInstance({ name: `${source.name} (Kopie)`, mcVersion: source.mcVersion })
  cpSync(getInstanceRoot(source.id), getInstanceRoot(clone.id), { recursive: true, force: true })
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
}
