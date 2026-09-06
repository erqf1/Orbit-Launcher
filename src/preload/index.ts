import { contextBridge, ipcRenderer } from 'electron'

// Kept local (not imported from src/main) so preload stays its own
// self-contained TS project and doesn't cross into the main-process one.
interface LauncherProfile {
  name: string
  id: string
}

interface LoginResult {
  profile: LauncherProfile
}

interface LaunchResult {
  started: boolean
  version: string
}

function onEvent<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  login: (): Promise<LoginResult> => ipcRenderer.invoke('auth:login'),
  currentAccount: (): Promise<LoginResult> => ipcRenderer.invoke('auth:current'),
  launch: (): Promise<LaunchResult> => ipcRenderer.invoke('launch:start'),
  onLog: (callback: (line: string) => void): (() => void) => onEvent('launch:log', callback),
  onProgress: (callback: (progress: unknown) => void): (() => void) =>
    onEvent('launch:progress', callback),
  onClosed: (callback: (code: number) => void): (() => void) => onEvent('launch:closed', callback)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
