import { contextBridge, ipcRenderer } from 'electron'

// Kept local (not imported from src/main) so preload stays its own
// self-contained TS project and doesn't cross into the main-process one.
interface LauncherProfile {
  name: string
  id: string
}

interface LoginResult {
  profile: LauncherProfile | null
}

interface LaunchResult {
  started: boolean
}

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

export interface MinecraftVersionSummary {
  id: string
  type: string
  releaseTime: string
}

function onEvent<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  login: (): Promise<LoginResult> => ipcRenderer.invoke('auth:login'),
  currentAccount: (): Promise<LoginResult> => ipcRenderer.invoke('auth:current'),
  launch: (instanceId: string): Promise<LaunchResult> =>
    ipcRenderer.invoke('launch:start', instanceId),

  listInstances: (): Promise<Instance[]> => ipcRenderer.invoke('instances:list'),
  createInstance: (input: CreateInstanceInput): Promise<Instance> =>
    ipcRenderer.invoke('instances:create', input),
  renameInstance: (id: string, name: string): Promise<Instance> =>
    ipcRenderer.invoke('instances:rename', id, name),
  deleteInstance: (id: string): Promise<void> => ipcRenderer.invoke('instances:delete', id),
  cloneInstance: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:clone', id),

  listVersions: (): Promise<MinecraftVersionSummary[]> => ipcRenderer.invoke('versions:list'),

  onLog: (callback: (line: string) => void): (() => void) => onEvent('launch:log', callback),
  onProgress: (callback: (progress: unknown) => void): (() => void) =>
    onEvent('launch:progress', callback),
  onClosed: (callback: (code: number) => void): (() => void) => onEvent('launch:closed', callback)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
