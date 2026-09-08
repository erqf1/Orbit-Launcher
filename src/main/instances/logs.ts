import { ipcMain } from 'electron'
import { existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'fs'
import { join } from 'path'
import { getInstanceRoot } from './instanceManager'

export interface LogFileEntry {
  folder: 'logs' | 'crash-reports'
  name: string
  sizeBytes: number
  modifiedAt: string
}

const LOG_FOLDERS = ['logs', 'crash-reports'] as const
const MAX_READ_BYTES = 2 * 1024 * 1024 // 2MB - large enough for any real log, avoids loading a runaway file whole

export function listLogFiles(instanceId: string): LogFileEntry[] {
  const root = getInstanceRoot(instanceId)
  const entries: LogFileEntry[] = []
  for (const folder of LOG_FOLDERS) {
    const dir = join(root, folder)
    if (!existsSync(dir)) continue
    for (const name of readdirSync(dir)) {
      const stat = statSync(join(dir, name))
      if (stat.isFile()) {
        entries.push({ folder, name, sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() })
      }
    }
  }
  return entries.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export function readLogFile(instanceId: string, folder: string, name: string): string {
  if (!(LOG_FOLDERS as readonly string[]).includes(folder)) throw new Error('Ungültiger Ordner.')
  if (!name || name.includes('/') || name.includes('\\') || name.includes('..')) {
    throw new Error('Ungültiger Dateiname.')
  }
  const filePath = join(getInstanceRoot(instanceId), folder, name)
  const stat = statSync(filePath)
  const fd = openSync(filePath, 'r')
  try {
    const size = Math.min(stat.size, MAX_READ_BYTES)
    const buffer = Buffer.alloc(size)
    readSync(fd, buffer, 0, size, 0)
    const content = buffer.toString('utf-8')
    return stat.size > MAX_READ_BYTES ? `${content}\n\n[... gekürzt, Datei ist größer als 2MB ...]` : content
  } finally {
    closeSync(fd)
  }
}

export function registerLogHandlers(): void {
  ipcMain.handle('logs:list', (_e, instanceId: string) => listLogFiles(instanceId))
  ipcMain.handle('logs:read', (_e, instanceId: string, folder: string, name: string) =>
    readLogFile(instanceId, folder, name)
  )
}
