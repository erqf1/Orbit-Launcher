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

export interface CreateInstanceInput {
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
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
  updateInstanceSettings: (id: string, patch: InstanceSettingsPatch): Promise<Instance> =>
    ipcRenderer.invoke('instances:updateSettings', id, patch),

  detectJava: (): Promise<JavaInstallation[]> => ipcRenderer.invoke('java:detect'),

  listVersions: (): Promise<MinecraftVersionSummary[]> => ipcRenderer.invoke('versions:list'),
  listLoaderVersions: (loader: 'fabric' | 'quilt', mcVersion: string): Promise<LoaderVersionSummary[]> =>
    ipcRenderer.invoke('loaders:list', loader, mcVersion),

  onLog: (callback: (line: string) => void): (() => void) => onEvent('launch:log', callback),
  onProgress: (callback: (progress: unknown) => void): (() => void) =>
    onEvent('launch:progress', callback),
  onClosed: (callback: (code: number) => void): (() => void) => onEvent('launch:closed', callback)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
