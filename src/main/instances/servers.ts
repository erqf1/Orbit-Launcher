import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as nbt from 'prismarine-nbt'
import { getInstanceRoot } from './instanceManager'

export interface ServerEntry {
  name: string
  ip: string
}

// servers.dat is uncompressed big-endian NBT (confirmed live against a real
// file - unlike level.dat, it isn't gzipped). Existing entries are modified
// via the raw typed-tag tree (not simplify()+reconstruct) specifically to
// avoid touching fields this app doesn't know about - a real servers.dat
// carries per-server icons as sizeable base64 blobs, and round-tripping
// through a lossy simplified representation risks silently dropping them.
// Verified with a real file: add+remove round-trips other entries' icon
// data byte-for-byte.
function serversFile(instanceId: string): string {
  return join(getInstanceRoot(instanceId), 'servers.dat')
}

async function readRoot(instanceId: string): Promise<nbt.NBT> {
  const file = serversFile(instanceId)
  if (!existsSync(file)) {
    return {
      type: nbt.TagType.Compound,
      name: '',
      value: { servers: { type: nbt.TagType.List, value: { type: nbt.TagType.Compound, value: [] } } }
    } as unknown as nbt.NBT
  }
  const { parsed } = await nbt.parse(readFileSync(file))
  return parsed
}

function writeRoot(instanceId: string, root: nbt.NBT): void {
  writeFileSync(serversFile(instanceId), nbt.writeUncompressed(root, 'big'))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getEntries(root: any): any[] {
  if (!root.value.servers) {
    root.value.servers = { type: nbt.TagType.List, value: { type: nbt.TagType.Compound, value: [] } }
  }
  return root.value.servers.value.value
}

export async function listServers(instanceId: string): Promise<ServerEntry[]> {
  const root = await readRoot(instanceId)
  return getEntries(root).map((entry) => ({
    name: (entry.name?.value as string) ?? '',
    ip: (entry.ip?.value as string) ?? ''
  }))
}

export async function addServer(instanceId: string, name: string, ip: string): Promise<void> {
  const root = await readRoot(instanceId)
  const entries = getEntries(root)
  entries.push({ name: nbt.string(name), ip: nbt.string(ip), hidden: nbt.byte(0) })
  writeRoot(instanceId, root)
}

export async function removeServer(instanceId: string, index: number): Promise<void> {
  const root = await readRoot(instanceId)
  const entries = getEntries(root)
  if (index < 0 || index >= entries.length) throw new Error('Server nicht gefunden.')
  entries.splice(index, 1)
  writeRoot(instanceId, root)
}

export function registerServerHandlers(): void {
  ipcMain.handle('servers:list', (_e, instanceId: string) => listServers(instanceId))
  ipcMain.handle('servers:add', (_e, instanceId: string, name: string, ip: string) =>
    addServer(instanceId, name, ip)
  )
  ipcMain.handle('servers:remove', (_e, instanceId: string, index: number) => removeServer(instanceId, index))
}
