import { contextBridge, ipcRenderer } from 'electron'

// Kept local (not imported from src/main) so preload stays its own
// self-contained TS project and doesn't cross into the main-process one.
interface LauncherProfile {
  name: string
  id: string
}

export interface SavedAccountMeta {
  id: string
  name: string
}

interface LoginResult {
  profile: LauncherProfile | null
  accounts: SavedAccountMeta[]
}

interface LaunchResult {
  launchId: string
}

export interface LaunchLogEvent {
  launchId: string
  instanceId: string
  line: string
}

export interface LaunchProgressEvent {
  launchId: string
  instanceId: string
  progress: unknown
}

export interface LaunchClosedEvent {
  launchId: string
  instanceId: string
  code: number
}

export type LoaderType = 'vanilla' | 'fabric' | 'quilt' | 'legacyfabric' | 'forge' | 'neoforge'

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: LoaderType
  loaderVersion: string | null
  customVersionId: string | null
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
  iconFilename: string | null
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
  notes?: string
}

export interface CloneAsVersionInput {
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
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

export interface ModSearchResult {
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl: string | null
  downloads: number
}

export interface ModVersionSummary {
  id: string
  versionNumber: string
  filename: string
  url: string
  requiredDependencyProjectIds: string[]
}

export interface ModFileRef {
  url: string
  filename: string
}

export interface InstalledMod {
  filename: string
  enabled: boolean
}

export interface ModMigrationResult {
  migrated: Array<{ oldFilename: string; newFilename: string; title: string }>
  failed: Array<{ oldFilename: string; title: string | null; reason: string }>
}

export interface ModCheckResult {
  status: 'verified' | 'nameMismatch' | 'unrecognized'
  filePath: string
  filename: string
  matchedProject?: { projectId: string; title: string; slug: string }
  matchedVersionNumber?: string
  claimedProject?: { projectId: string; title: string; slug: string }
}

export interface CuratedMod extends ModSearchResult {
  category: string
  compatible: boolean
}

export interface PrismInstanceSummary {
  folderName: string
  name: string
  mcVersion: string | null
  loader: LoaderType | 'unsupported'
  loaderVersion: string | null
  unsupportedReason: string | null
}

export interface ContentFileEntry {
  name: string
  size: number
  modifiedAt: string
  isDirectory: boolean
}

export interface WorldEntry {
  folderName: string
  sizeBytes: number
  lastPlayed: string
}

export interface ServerEntry {
  name: string
  ip: string
}

export interface LogFileEntry {
  folder: 'logs' | 'crash-reports'
  name: string
  sizeBytes: number
  modifiedAt: string
}

function onEvent<T>(channel: string, callback: (payload: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, payload: T): void => callback(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  login: (): Promise<LoginResult> => ipcRenderer.invoke('auth:login'),
  currentAccount: (): Promise<LoginResult> => ipcRenderer.invoke('auth:current'),
  switchAccount: (id: string): Promise<LoginResult> => ipcRenderer.invoke('auth:switch', id),
  removeAccount: (id: string): Promise<LoginResult> => ipcRenderer.invoke('auth:remove', id),
  launch: (instanceId: string): Promise<LaunchResult> =>
    ipcRenderer.invoke('launch:start', instanceId),

  listInstances: (): Promise<Instance[]> => ipcRenderer.invoke('instances:list'),
  createInstance: (input: CreateInstanceInput): Promise<Instance> =>
    ipcRenderer.invoke('instances:create', input),
  renameInstance: (id: string, name: string): Promise<Instance> =>
    ipcRenderer.invoke('instances:rename', id, name),
  deleteInstance: (id: string): Promise<void> => ipcRenderer.invoke('instances:delete', id),
  cloneInstance: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:clone', id),
  cloneInstanceAsVersion: (id: string, input: CloneAsVersionInput): Promise<Instance> =>
    ipcRenderer.invoke('instances:cloneAsVersion', id, input),
  changeInstanceVersion: (id: string, input: CloneAsVersionInput): Promise<Instance> =>
    ipcRenderer.invoke('instances:changeVersion', id, input),
  updateInstanceSettings: (id: string, patch: InstanceSettingsPatch): Promise<Instance> =>
    ipcRenderer.invoke('instances:updateSettings', id, patch),
  openInstanceFolder: (id: string): Promise<void> => ipcRenderer.invoke('instances:openFolder', id),
  getInstanceIconDataUrl: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('instances:getIconDataUrl', id),
  setInstanceIcon: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:setIcon', id),
  clearInstanceIcon: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:clearIcon', id),

  detectJava: (): Promise<JavaInstallation[]> => ipcRenderer.invoke('java:detect'),

  listVersions: (): Promise<MinecraftVersionSummary[]> => ipcRenderer.invoke('versions:list'),
  listLoaderVersions: (
    loader: Exclude<LoaderType, 'vanilla'>,
    mcVersion: string
  ): Promise<LoaderVersionSummary[]> => ipcRenderer.invoke('loaders:list', loader, mcVersion),

  searchMods: (query: string, mcVersion: string, loader: string): Promise<ModSearchResult[]> =>
    ipcRenderer.invoke('mods:search', query, mcVersion, loader),
  listModVersions: (projectId: string, mcVersion: string, loader: string): Promise<ModVersionSummary[]> =>
    ipcRenderer.invoke('mods:versions', projectId, mcVersion, loader),
  installMod: (instanceId: string, file: ModFileRef): Promise<void> =>
    ipcRenderer.invoke('mods:install', instanceId, file),
  listMods: (instanceId: string): Promise<InstalledMod[]> => ipcRenderer.invoke('mods:list', instanceId),
  removeMod: (instanceId: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('mods:remove', instanceId, filename),
  toggleModEnabled: (instanceId: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('mods:toggleEnabled', instanceId, filename),
  copyMods: (sourceInstanceId: string, targetInstanceId: string, filenames: string[]): Promise<void> =>
    ipcRenderer.invoke('mods:copyTo', sourceInstanceId, targetInstanceId, filenames),
  migrateMods: (instanceId: string, mcVersion: string, loader: string): Promise<ModMigrationResult> =>
    ipcRenderer.invoke('mods:migrate', instanceId, mcVersion, loader),
  pickAndCheckModFile: (): Promise<ModCheckResult | null> => ipcRenderer.invoke('mods:pickAndCheckFile'),
  installModFromFile: (instanceId: string, filePath: string): Promise<void> =>
    ipcRenderer.invoke('mods:installFromFile', instanceId, filePath),
  getModDependencies: (
    projectId: string,
    mcVersion: string,
    loader: string
  ): Promise<ModSearchResult[]> => ipcRenderer.invoke('mods:dependencies', projectId, mcVersion, loader),
  listCuratedMods: (mcVersion: string, loader: string): Promise<CuratedMod[]> =>
    ipcRenderer.invoke('mods:curated', mcVersion, loader),

  listPrismInstances: (rootOverride?: string): Promise<PrismInstanceSummary[]> =>
    ipcRenderer.invoke('prism:list', rootOverride),
  importPrismInstance: (rootOverride: string | undefined, folderName: string): Promise<Instance> =>
    ipcRenderer.invoke('prism:import', rootOverride, folderName),
  browsePrismFolder: (): Promise<string | null> => ipcRenderer.invoke('prism:browseFolder'),

  listContentFiles: (instanceId: string, subfolder: string): Promise<ContentFileEntry[]> =>
    ipcRenderer.invoke('content:list', instanceId, subfolder),
  removeContentFile: (instanceId: string, subfolder: string, name: string): Promise<void> =>
    ipcRenderer.invoke('content:remove', instanceId, subfolder, name),
  renameContentFile: (instanceId: string, subfolder: string, oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('content:rename', instanceId, subfolder, oldName, newName),
  addContentFiles: (instanceId: string, subfolder: string): Promise<number> =>
    ipcRenderer.invoke('content:add', instanceId, subfolder),
  openContentFolder: (instanceId: string, subfolder: string): Promise<void> =>
    ipcRenderer.invoke('content:openFolder', instanceId, subfolder),

  listWorlds: (instanceId: string): Promise<WorldEntry[]> => ipcRenderer.invoke('worlds:list', instanceId),
  renameWorld: (instanceId: string, oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('worlds:rename', instanceId, oldName, newName),
  deleteWorld: (instanceId: string, name: string): Promise<void> =>
    ipcRenderer.invoke('worlds:delete', instanceId, name),
  openWorldsFolder: (instanceId: string): Promise<void> => ipcRenderer.invoke('worlds:openFolder', instanceId),

  listServers: (instanceId: string): Promise<ServerEntry[]> => ipcRenderer.invoke('servers:list', instanceId),
  addServer: (instanceId: string, name: string, ip: string): Promise<void> =>
    ipcRenderer.invoke('servers:add', instanceId, name, ip),
  removeServer: (instanceId: string, index: number): Promise<void> =>
    ipcRenderer.invoke('servers:remove', instanceId, index),

  listLogFiles: (instanceId: string): Promise<LogFileEntry[]> => ipcRenderer.invoke('logs:list', instanceId),
  readLogFile: (instanceId: string, folder: string, name: string): Promise<string> =>
    ipcRenderer.invoke('logs:read', instanceId, folder, name),

  onLog: (callback: (event: LaunchLogEvent) => void): (() => void) => onEvent('launch:log', callback),
  onProgress: (callback: (event: LaunchProgressEvent) => void): (() => void) =>
    onEvent('launch:progress', callback),
  onClosed: (callback: (event: LaunchClosedEvent) => void): (() => void) =>
    onEvent('launch:closed', callback)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
