// Local view-layer copies of the shapes preload exposes on window.api.
// Kept separate from src/preload so the renderer's TS project doesn't have
// to reach across into preload's project.

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

export interface LaunchLogEvent {
  launchId: string
  instanceId: string
  line: string
}

export interface LaunchClosedEvent {
  launchId: string
  instanceId: string
  code: number
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

// --- Server hosting (Vanilla/Fabric/Paper) - see preload/index.ts's own
// comment: a fundamentally different concept from a client Instance.
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
}

export interface ServerSettingsPatch {
  memoryMin?: string
  memoryMax?: string
  javaPath?: string | null
  jvmArgs?: string | null
  serverPort?: number
  tunnelEnabled?: boolean
  tunnelPublicAddress?: string | null
}

export interface CreateServerInput {
  name: string
  mcVersion: string
  loader: ServerLoaderType
  fabricLoaderVersion?: string
  paperBuildId?: number
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
