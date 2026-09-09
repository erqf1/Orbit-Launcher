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
  askOnPlay: boolean
}

export interface CapeInfo {
  id: string
  url: string
  alias: string
  active: boolean
}

export interface AccountCustomization {
  skinUrl: string | null
  variant: 'CLASSIC' | 'SLIM'
  capes: CapeInfo[]
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
  favorite: boolean
  group: string | null
  coverColor: string | null
  bannerFilename: string | null
  quitAppOnGameClose: boolean
  totalPlaytimeMs: number
  trackPlaytime: boolean
  overrideAccountId: string | null
  skipJavaCompatWarning: boolean
  preLaunchCommand: string | null
  postExitCommand: string | null
  envVars: Array<{ name: string; value: string }>
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
  quitAppOnGameClose?: boolean
  trackPlaytime?: boolean
  overrideAccountId?: string | null
  skipJavaCompatWarning?: boolean
  preLaunchCommand?: string | null
  postExitCommand?: string | null
  envVars?: Array<{ name: string; value: string }>
}

export interface CloneAsVersionInput {
  mcVersion: string
  loader: LoaderType
  loaderVersion?: string
}

export interface CloneContentOptions {
  mods: boolean
  worlds: boolean
  resourcepacks: boolean
  shaderpacks: boolean
  screenshots: boolean
  servers: boolean
  settings: boolean
}

export interface JavaInstallation {
  path: string
  version: string
}

export interface JavaCompatCheck {
  installedVersion: string | null
  installedMajor: number | null
  requiredMajor: number | null
  mismatch: boolean
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
  title: string | null
  versionNumber: string | null
  iconUrl: string | null
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

export interface UpdateCandidate {
  filename: string
  title: string
  currentVersionNumber: string | null
  newVersionNumber: string
  file: ModFileRef
}

export interface PrismInstanceSummary {
  folderName: string
  name: string
  mcVersion: string | null
  loader: LoaderType | 'unsupported'
  loaderVersion: string | null
  unsupportedReason: string | null
}

export interface LauncherOption {
  id: string
  label: string
  detected: boolean
  supported: boolean
}

export interface ContentFileEntry {
  name: string
  size: number
  modifiedAt: string
  isDirectory: boolean
}

export interface EnrichedContentFile extends ContentFileEntry {
  title: string | null
  versionNumber: string | null
  iconUrl: string | null
}

export interface WorldEntry {
  folderName: string
  sizeBytes: number
  lastPlayed: string
}

export interface ServerEntry {
  name: string
  ip: string
  iconDataUrl: string | null
}

export interface LogFileEntry {
  folder: 'logs' | 'crash-reports'
  name: string
  sizeBytes: number
  modifiedAt: string
}

// --- Server hosting (Vanilla/Fabric/Paper) - a fundamentally different
// concept from an Instance (a client game install): a ServerInstance is a
// headless java process this app spawns, streams console output for, and
// can send commands to. Kept fully separate rather than folded into
// Instance/LoaderType, which are both client-only concepts.
export type ServerLoaderType = 'vanilla' | 'fabric' | 'paper'

export interface ServerInstance {
  id: string
  name: string
  mcVersion: string
  loader: ServerLoaderType
  fabricLoaderVersion: string | null
  fabricInstallerVersion: string | null
  paperBuildId: number | null
  memoryMin: string
  memoryMax: string
  javaPath: string | null
  jvmArgs: string | null
  serverPort: number
  eulaAccepted: boolean
  createdAt: string
  lastStarted: string | null
  tunnelEnabled: boolean
  tunnelPublicAddress: string | null
  tunnelSecretKey: string | null
}

export interface ServerSettingsPatch {
  memoryMin?: string
  memoryMax?: string
  javaPath?: string | null
  jvmArgs?: string | null
  serverPort?: number
  tunnelEnabled?: boolean
  tunnelPublicAddress?: string | null
  tunnelSecretKey?: string | null
}

export interface CreateServerInput {
  name: string
  mcVersion: string
  loader: ServerLoaderType
  fabricLoaderVersion?: string
  paperBuildId?: number
  acceptEula?: boolean
}

export interface PaperBuildSummary {
  id: number
  time: string
  channel: string
}

export interface ServerLogEvent {
  serverId: string
  line: string
}

export interface ServerClosedEvent {
  serverId: string
  code: number
}

export interface InstalledPlugin {
  filename: string
  title: string | null
  versionNumber: string | null
  iconUrl: string | null
}

export interface FriendsModEntry {
  filename: string
  title: string
  environment: string
  resolved: boolean
  suggestedInclude: boolean
}

export interface TunnelLogEvent {
  serverId: string
  line: string
}

export interface TunnelClaimUrlEvent {
  serverId: string
  url: string
}

export interface TunnelAddressAssignedEvent {
  serverId: string
  address: string
}

export interface TunnelClosedEvent {
  serverId: string
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
  setAskOnPlay: (value: boolean): Promise<LoginResult> => ipcRenderer.invoke('auth:setAskOnPlay', value),
  getAccountCustomization: (id: string): Promise<AccountCustomization | null> =>
    ipcRenderer.invoke('auth:getCustomization', id),
  changeSkin: (id: string, variant: 'CLASSIC' | 'SLIM'): Promise<AccountCustomization | null> =>
    ipcRenderer.invoke('auth:changeSkin', id, variant),
  setActiveCape: (id: string, capeId: string | null): Promise<AccountCustomization | null> =>
    ipcRenderer.invoke('auth:setActiveCape', id, capeId),
  launch: (instanceId: string): Promise<LaunchResult> =>
    ipcRenderer.invoke('launch:start', instanceId),
  consumePendingLaunchInstanceId: (): Promise<string | null> =>
    ipcRenderer.invoke('launch:consumePendingInstanceId'),

  listInstances: (): Promise<Instance[]> => ipcRenderer.invoke('instances:list'),
  createInstance: (input: CreateInstanceInput): Promise<Instance> =>
    ipcRenderer.invoke('instances:create', input),
  renameInstance: (id: string, name: string): Promise<Instance> =>
    ipcRenderer.invoke('instances:rename', id, name),
  deleteInstance: (id: string): Promise<void> => ipcRenderer.invoke('instances:delete', id),
  cloneInstance: (id: string, contentOptions: CloneContentOptions): Promise<Instance> =>
    ipcRenderer.invoke('instances:clone', id, contentOptions),
  cloneInstanceAsVersion: (
    id: string,
    input: CloneAsVersionInput,
    contentOptions: CloneContentOptions
  ): Promise<Instance> => ipcRenderer.invoke('instances:cloneAsVersion', id, input, contentOptions),
  changeInstanceVersion: (id: string, input: CloneAsVersionInput): Promise<Instance> =>
    ipcRenderer.invoke('instances:changeVersion', id, input),
  updateInstanceSettings: (id: string, patch: InstanceSettingsPatch): Promise<Instance> =>
    ipcRenderer.invoke('instances:updateSettings', id, patch),
  openInstanceFolder: (id: string): Promise<void> => ipcRenderer.invoke('instances:openFolder', id),
  getInstanceIconDataUrl: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('instances:getIconDataUrl', id),
  setInstanceIcon: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:setIcon', id),
  clearInstanceIcon: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:clearIcon', id),
  getInstanceBannerDataUrl: (id: string): Promise<string | null> =>
    ipcRenderer.invoke('instances:getBannerDataUrl', id),
  setInstanceBanner: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:setBanner', id),
  clearInstanceBanner: (id: string): Promise<Instance> => ipcRenderer.invoke('instances:clearBanner', id),
  createInstanceShortcut: (id: string): Promise<string> =>
    ipcRenderer.invoke('instances:createShortcut', id),

  detectJava: (): Promise<JavaInstallation[]> => ipcRenderer.invoke('java:detect'),
  browseForJava: (): Promise<JavaInstallation | null> => ipcRenderer.invoke('java:browse'),
  checkJavaCompat: (javaPath: string, mcVersion: string): Promise<JavaCompatCheck> =>
    ipcRenderer.invoke('java:checkCompat', javaPath, mcVersion),

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
  checkModUpdates: (instanceId: string, mcVersion: string, loader: string): Promise<UpdateCandidate[]> =>
    ipcRenderer.invoke('mods:checkUpdates', instanceId, mcVersion, loader),
  updateMod: (instanceId: string, oldFilename: string, file: ModFileRef): Promise<void> =>
    ipcRenderer.invoke('mods:update', instanceId, oldFilename, file),
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

  detectLaunchers: (): Promise<LauncherOption[]> => ipcRenderer.invoke('launchers:detect'),
  detectOfficialRoot: (): Promise<string | null> => ipcRenderer.invoke('official:detectRoot'),
  importOfficialMinecraft: (rootOverride?: string): Promise<Instance> =>
    ipcRenderer.invoke('official:import', rootOverride),
  browseOfficialFolder: (): Promise<string | null> => ipcRenderer.invoke('official:browseFolder'),

  listContentFiles: (instanceId: string, subfolder: string): Promise<ContentFileEntry[]> =>
    ipcRenderer.invoke('content:list', instanceId, subfolder),
  listContentFilesEnriched: (instanceId: string, subfolder: string): Promise<EnrichedContentFile[]> =>
    ipcRenderer.invoke('content:listEnriched', instanceId, subfolder),
  removeContentFile: (instanceId: string, subfolder: string, name: string): Promise<void> =>
    ipcRenderer.invoke('content:remove', instanceId, subfolder, name),
  renameContentFile: (instanceId: string, subfolder: string, oldName: string, newName: string): Promise<void> =>
    ipcRenderer.invoke('content:rename', instanceId, subfolder, oldName, newName),
  addContentFiles: (instanceId: string, subfolder: string): Promise<number> =>
    ipcRenderer.invoke('content:add', instanceId, subfolder),
  openContentFolder: (instanceId: string, subfolder: string): Promise<void> =>
    ipcRenderer.invoke('content:openFolder', instanceId, subfolder),
  getContentFileDataUrl: (instanceId: string, subfolder: string, name: string): Promise<string | null> =>
    ipcRenderer.invoke('content:getDataUrl', instanceId, subfolder, name),
  copyContentFileToClipboard: (instanceId: string, subfolder: string, name: string): Promise<void> =>
    ipcRenderer.invoke('content:copyToClipboard', instanceId, subfolder, name),
  searchContent: (
    query: string,
    projectType: 'resourcepack' | 'shader',
    mcVersion: string
  ): Promise<ModSearchResult[]> => ipcRenderer.invoke('content:search', query, projectType, mcVersion),
  getBestContentVersion: (projectId: string, mcVersion: string): Promise<ModFileRef | null> =>
    ipcRenderer.invoke('content:bestVersion', projectId, mcVersion),
  installContentFileFromUrl: (instanceId: string, subfolder: string, file: ModFileRef): Promise<void> =>
    ipcRenderer.invoke('content:installFromUrl', instanceId, subfolder, file),
  checkContentUpdates: (instanceId: string, subfolder: string, mcVersion: string): Promise<UpdateCandidate[]> =>
    ipcRenderer.invoke('content:checkUpdates', instanceId, subfolder, mcVersion),
  updateContentFile: (instanceId: string, subfolder: string, oldName: string, file: ModFileRef): Promise<void> =>
    ipcRenderer.invoke('content:update', instanceId, subfolder, oldName, file),

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

  listCustomBackgrounds: (): Promise<string[]> => ipcRenderer.invoke('background:list'),
  addCustomBackground: (): Promise<string[]> => ipcRenderer.invoke('background:add'),
  removeCustomBackground: (index: number): Promise<string[]> => ipcRenderer.invoke('background:remove', index),

  onLog: (callback: (event: LaunchLogEvent) => void): (() => void) => onEvent('launch:log', callback),
  onProgress: (callback: (event: LaunchProgressEvent) => void): (() => void) =>
    onEvent('launch:progress', callback),
  onClosed: (callback: (event: LaunchClosedEvent) => void): (() => void) =>
    onEvent('launch:closed', callback),

  listHostedServers: (): Promise<ServerInstance[]> => ipcRenderer.invoke('servers:hostList'),
  createHostedServer: (input: CreateServerInput): Promise<ServerInstance> =>
    ipcRenderer.invoke('servers:hostCreate', input),
  renameHostedServer: (id: string, name: string): Promise<ServerInstance> =>
    ipcRenderer.invoke('servers:hostRename', id, name),
  deleteHostedServer: (id: string): Promise<void> => ipcRenderer.invoke('servers:hostDelete', id),
  updateHostedServerSettings: (id: string, patch: ServerSettingsPatch): Promise<ServerInstance> =>
    ipcRenderer.invoke('servers:hostUpdateSettings', id, patch),
  openHostedServerFolder: (id: string): Promise<void> => ipcRenderer.invoke('servers:hostOpenFolder', id),
  listPaperVersions: (): Promise<string[]> => ipcRenderer.invoke('servers:hostListPaperVersions'),
  listPaperBuilds: (mcVersion: string): Promise<PaperBuildSummary[]> =>
    ipcRenderer.invoke('servers:hostListPaperBuilds', mcVersion),

  startHostedServer: (id: string): Promise<void> => ipcRenderer.invoke('servers:hostStart', id),
  stopHostedServer: (id: string): Promise<void> => ipcRenderer.invoke('servers:hostStop', id),
  sendHostedServerCommand: (id: string, command: string): Promise<void> =>
    ipcRenderer.invoke('servers:hostSendCommand', id, command),
  isHostedServerRunning: (id: string): Promise<boolean> => ipcRenderer.invoke('servers:hostIsRunning', id),

  readServerProperties: (id: string): Promise<Record<string, string>> =>
    ipcRenderer.invoke('servers:hostPropertiesRead', id),
  writeServerProperties: (id: string, patch: Record<string, string>): Promise<void> =>
    ipcRenderer.invoke('servers:hostPropertiesWrite', id, patch),
  acceptServerEula: (id: string): Promise<void> => ipcRenderer.invoke('servers:hostEulaAccept', id),
  getServerEulaStatus: (id: string): Promise<boolean> => ipcRenderer.invoke('servers:hostEulaStatus', id),

  searchPlugins: (query: string, mcVersion: string): Promise<ModSearchResult[]> =>
    ipcRenderer.invoke('plugins:search', query, mcVersion),
  listPluginVersions: (projectId: string, mcVersion: string): Promise<ModVersionSummary[]> =>
    ipcRenderer.invoke('plugins:versions', projectId, mcVersion),
  installPlugin: (serverId: string, file: ModFileRef): Promise<void> =>
    ipcRenderer.invoke('plugins:install', serverId, file),
  listInstalledPlugins: (serverId: string): Promise<InstalledPlugin[]> =>
    ipcRenderer.invoke('plugins:list', serverId),
  removePlugin: (serverId: string, filename: string): Promise<void> =>
    ipcRenderer.invoke('plugins:remove', serverId, filename),

  scanFriendsMods: (serverId: string): Promise<FriendsModEntry[]> =>
    ipcRenderer.invoke('friendsMods:scan', serverId),
  exportFriendsMods: (serverId: string, selectedFilenames: string[]): Promise<string | null> =>
    ipcRenderer.invoke('friendsMods:export', serverId, selectedFilenames),

  startTunnel: (serverId: string, localPort: number): Promise<void> =>
    ipcRenderer.invoke('tunnel:start', serverId, localPort),
  stopTunnel: (serverId: string): Promise<void> => ipcRenderer.invoke('tunnel:stop', serverId),
  getTunnelStatus: (serverId: string): Promise<boolean> => ipcRenderer.invoke('tunnel:status', serverId),
  openTunnelClaimUrl: (url: string): Promise<void> => ipcRenderer.invoke('tunnel:openClaimUrl', url),
  setTunnelSecretKey: (serverId: string, secretKey: string | null): Promise<void> =>
    ipcRenderer.invoke('tunnel:setSecretKey', serverId, secretKey),

  onServerLog: (callback: (event: ServerLogEvent) => void): (() => void) => onEvent('server:log', callback),
  onServerClosed: (callback: (event: ServerClosedEvent) => void): (() => void) =>
    onEvent('server:closed', callback),
  onTunnelLog: (callback: (event: TunnelLogEvent) => void): (() => void) => onEvent('tunnel:log', callback),
  onTunnelClaimUrl: (callback: (event: TunnelClaimUrlEvent) => void): (() => void) =>
    onEvent('tunnel:claimUrl', callback),
  onTunnelAddressAssigned: (callback: (event: TunnelAddressAssignedEvent) => void): (() => void) =>
    onEvent('tunnel:addressAssigned', callback),
  onTunnelClosed: (callback: (event: TunnelClosedEvent) => void): (() => void) =>
    onEvent('tunnel:closed', callback)
}

contextBridge.exposeInMainWorld('api', api)

export type Api = typeof api
