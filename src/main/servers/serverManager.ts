import { ipcMain, app, shell } from 'electron'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { getFabricStableInstallerVersion, downloadFabricServerJar } from '../loaders/fabric'
import { downloadVanillaServerJar, downloadPaperServerJar, listPaperVersions, listPaperBuilds } from './serverJar'

// Deliberately a sibling of instances/ rather than a variant of Instance -
// hosting a server (a headless java process this app spawns/owns/streams
// console for) is a fundamentally different thing from launching the game
// as a client, even though the on-disk persistence shape looks similar.
// src/main/instances/servers.ts is a *different*, unrelated feature (a
// client's servers.dat multiplayer join-list) - not to be confused with this.
export type ServerLoaderType = 'vanilla' | 'fabric' | 'paper'

export interface ServerInstance {
  id: string
  // Same rationale as Instance.folderName: human-readable on-disk directory
  // name, decoupled from `id` so a rename doesn't require moving files.
  folderName?: string
  name: string
  mcVersion: string
  loader: ServerLoaderType
  // Fabric only - null for vanilla/paper.
  fabricLoaderVersion: string | null
  fabricInstallerVersion: string | null
  // Paper only - null for vanilla/fabric.
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

function getServersFile(): string {
  return join(app.getPath('userData'), 'servers.json')
}

function sanitizeFolderName(name: string): string {
  const cleaned = name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/, '')
  return cleaned || 'Server'
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

export function getServerRoot(id: string): string {
  const server = readAll().find((s) => s.id === id)
  const folderName = server?.folderName ?? id
  return join(app.getPath('userData'), 'servers', folderName)
}

function readAll(): ServerInstance[] {
  const file = getServersFile()
  if (!existsSync(file)) return []
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as ServerInstance[]
  } catch {
    return []
  }
}

function writeAll(servers: ServerInstance[]): void {
  writeFileSync(getServersFile(), JSON.stringify(servers, null, 2), 'utf-8')
}

export function listServers(): ServerInstance[] {
  return readAll()
}

export function getServer(id: string): ServerInstance | undefined {
  return readAll().find((s) => s.id === id)
}

// Downloads the right server jar for the chosen loader before the record is
// ever written, same "don't leave an empty/broken entry behind on failure"
// discipline as instanceManager's createInstance - a bad version/loader
// combo or a network hiccup removes the half-created folder instead of
// leaving a server that can never actually start.
export async function createServer(input: CreateServerInput): Promise<ServerInstance> {
  const id = randomUUID()
  const existingFolders = new Set(readAll().map((s) => (s.folderName ?? s.id).toLowerCase()))
  const folderName = uniqueFolderName(sanitizeFolderName(input.name), existingFolders)
  const root = join(app.getPath('userData'), 'servers', folderName)
  mkdirSync(root, { recursive: true })

  let fabricInstallerVersion: string | null = null
  try {
    if (input.loader === 'vanilla') {
      await downloadVanillaServerJar(root, input.mcVersion)
    } else if (input.loader === 'fabric') {
      if (!input.fabricLoaderVersion) throw new Error('Bitte eine Fabric-Loader-Version auswählen.')
      fabricInstallerVersion = await getFabricStableInstallerVersion()
      await downloadFabricServerJar(root, input.mcVersion, input.fabricLoaderVersion, fabricInstallerVersion)
    } else {
      await downloadPaperServerJar(root, input.mcVersion, input.paperBuildId)
    }
  } catch (err) {
    rmSync(root, { recursive: true, force: true })
    throw err
  }

  const server: ServerInstance = {
    id,
    folderName,
    name: input.name,
    mcVersion: input.mcVersion,
    loader: input.loader,
    fabricLoaderVersion: input.fabricLoaderVersion ?? null,
    fabricInstallerVersion,
    paperBuildId: input.paperBuildId ?? null,
    memoryMin: '1G',
    memoryMax: '4G',
    javaPath: null,
    jvmArgs: null,
    serverPort: 25565,
    eulaAccepted: false,
    createdAt: new Date().toISOString(),
    lastStarted: null,
    tunnelEnabled: false,
    tunnelPublicAddress: null
  }

  const servers = readAll()
  servers.push(server)
  writeAll(servers)
  return server
}

// serverProcess.ts already imports getServer/getServerRoot/markServerStarted
// from this module, so this module can't import back from serverProcess.ts
// (circular import) to ask "is this server currently running" directly.
// index.ts wires the real check in once both modules are registered.
let isServerRunningCheck: ((id: string) => boolean) | null = null

export function setIsServerRunningCheck(check: (id: string) => boolean): void {
  isServerRunningCheck = check
}

export function deleteServer(id: string): void {
  if (isServerRunningCheck?.(id)) {
    throw new Error('Server läuft gerade und kann nicht gelöscht werden.')
  }
  const root = getServerRoot(id)
  writeAll(readAll().filter((server) => server.id !== id))
  rmSync(root, { recursive: true, force: true })
}

export function renameServer(id: string, name: string): ServerInstance {
  const servers = readAll()
  const server = servers.find((s) => s.id === id)
  if (!server) throw new Error('Server nicht gefunden.')
  server.name = name
  writeAll(servers)
  return server
}

export function updateServerSettings(id: string, patch: ServerSettingsPatch): ServerInstance {
  const servers = readAll()
  const server = servers.find((s) => s.id === id)
  if (!server) throw new Error('Server nicht gefunden.')
  Object.assign(server, patch)
  writeAll(servers)
  return server
}

export function markServerStarted(id: string): void {
  const servers = readAll()
  const server = servers.find((s) => s.id === id)
  if (!server) return
  server.lastStarted = new Date().toISOString()
  writeAll(servers)
}

export function setServerEulaAccepted(id: string, accepted: boolean): ServerInstance {
  return updateServerSettingsInternal(id, { eulaAccepted: accepted })
}

// updateServerSettings's patch type intentionally doesn't expose
// eulaAccepted (it's set exclusively via the dedicated eula:accept flow in
// serverProperties.ts, not a freeform settings field) - this internal
// helper is the one place that writes it.
function updateServerSettingsInternal(id: string, patch: Partial<ServerInstance>): ServerInstance {
  const servers = readAll()
  const server = servers.find((s) => s.id === id)
  if (!server) throw new Error('Server nicht gefunden.')
  Object.assign(server, patch)
  writeAll(servers)
  return server
}

export function openServerFolder(id: string): Promise<void> {
  return shell.openPath(getServerRoot(id)).then((err) => {
    if (err) throw new Error(err)
  })
}

export function registerServerManagerHandlers(): void {
  ipcMain.handle('servers:hostList', () => listServers())
  ipcMain.handle('servers:hostCreate', (_event, input: CreateServerInput) => createServer(input))
  ipcMain.handle('servers:hostRename', (_event, id: string, name: string) => renameServer(id, name))
  ipcMain.handle('servers:hostDelete', (_event, id: string) => deleteServer(id))
  ipcMain.handle('servers:hostUpdateSettings', (_event, id: string, patch: ServerSettingsPatch) =>
    updateServerSettings(id, patch)
  )
  ipcMain.handle('servers:hostOpenFolder', (_event, id: string) => openServerFolder(id))
  ipcMain.handle('servers:hostListPaperVersions', () => listPaperVersions())
  ipcMain.handle('servers:hostListPaperBuilds', (_event, mcVersion: string) => listPaperBuilds(mcVersion))
}
