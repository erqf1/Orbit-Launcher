import { ipcMain, shell } from 'electron'
import { existsSync, readdirSync, statSync, renameSync, rmSync } from 'fs'
import { join } from 'path'
import { getInstanceRoot } from './instanceManager'

export interface WorldEntry {
  folderName: string
  sizeBytes: number
  lastPlayed: string
}

function assertSafeName(name: string): void {
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Ungültiger Weltname.')
  }
}

function dirSize(dir: string): number {
  let total = 0
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    total += entry.isDirectory() ? dirSize(full) : statSync(full).size
  }
  return total
}

export function listWorlds(instanceId: string): WorldEntry[] {
  const savesDir = join(getInstanceRoot(instanceId), 'saves')
  if (!existsSync(savesDir)) return []
  return readdirSync(savesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const full = join(savesDir, e.name)
      return {
        folderName: e.name,
        sizeBytes: dirSize(full),
        lastPlayed: statSync(full).mtime.toISOString()
      }
    })
}

export function renameWorld(instanceId: string, oldName: string, newName: string): void {
  assertSafeName(oldName)
  assertSafeName(newName)
  const savesDir = join(getInstanceRoot(instanceId), 'saves')
  renameSync(join(savesDir, oldName), join(savesDir, newName))
}

export function deleteWorld(instanceId: string, name: string): void {
  assertSafeName(name)
  const target = join(getInstanceRoot(instanceId), 'saves', name)
  if (existsSync(target)) rmSync(target, { recursive: true, force: true })
}

export function openWorldsFolder(instanceId: string): Promise<void> {
  return shell.openPath(join(getInstanceRoot(instanceId), 'saves')).then((err) => {
    if (err) throw new Error(err)
  })
}

export function registerWorldHandlers(): void {
  ipcMain.handle('worlds:list', (_e, instanceId: string) => listWorlds(instanceId))
  ipcMain.handle('worlds:rename', (_e, instanceId: string, oldName: string, newName: string) =>
    renameWorld(instanceId, oldName, newName)
  )
  ipcMain.handle('worlds:delete', (_e, instanceId: string, name: string) => deleteWorld(instanceId, name))
  ipcMain.handle('worlds:openFolder', (_e, instanceId: string) => openWorldsFolder(instanceId))
}
