import { ipcMain } from 'electron'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { isAbsolute, join, relative, resolve, sep } from 'path'
import { getServerRoot } from './serverManager'

// Generic text-file browser/editor scoped to a server's own root - backs
// both the Paper global-config tab (config/paper-global.yml etc, YAML files
// Paper itself generates on first boot) and the per-plugin config browser
// (plugins/<name>/*, arbitrary files a plugin generates), rather than
// building two bespoke, narrower features for what's really the same need:
// "let me look at and edit a text file this server owns."
const MAX_READ_BYTES = 2 * 1024 * 1024
const TEXT_EXTENSIONS = new Set([
  '.yml',
  '.yaml',
  '.json',
  '.properties',
  '.txt',
  '.toml',
  '.conf',
  '.cfg',
  '.ini',
  '.log'
])

export interface ServerFileEntry {
  name: string
  path: string
  isDirectory: boolean
  editable: boolean
}

// Resolves relativePath against the server's root and verifies the result
// didn't escape it (a '../'-laden relativePath from the renderer - even
// though it's this app's own UI, not attacker input, every other
// filename-derived path builder in this codebase does this same check, and
// this one crosses more directory levels than any of them, so it matters
// more here, not less).
function resolveSafePath(serverId: string, relativePath: string): string {
  const root = getServerRoot(serverId)
  const target = resolve(root, relativePath)
  const rel = relative(root, target)
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error('Ungültiger Pfad.')
  }
  return target
}

export function listServerFiles(serverId: string, relativeDir: string): ServerFileEntry[] {
  const dir = resolveSafePath(serverId, relativeDir)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .map((name) => {
      const full = join(dir, name)
      const isDirectory = statSync(full).isDirectory()
      const ext = name.slice(name.lastIndexOf('.')).toLowerCase()
      return {
        name,
        path: relativeDir ? `${relativeDir}/${name}` : name,
        isDirectory,
        editable: !isDirectory && TEXT_EXTENSIONS.has(ext)
      }
    })
    .sort((a, b) => {
      if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
      return a.name.localeCompare(b.name)
    })
}

export function readServerFile(serverId: string, relativePath: string): string | null {
  const file = resolveSafePath(serverId, relativePath)
  if (!existsSync(file)) return null
  const stat = statSync(file)
  if (stat.size > MAX_READ_BYTES) {
    throw new Error(`Datei ist zu groß zum Anzeigen (>${Math.round(MAX_READ_BYTES / 1024 / 1024)}MB).`)
  }
  return readFileSync(file, 'utf-8')
}

export function writeServerFile(serverId: string, relativePath: string, content: string): void {
  const file = resolveSafePath(serverId, relativePath)
  mkdirSync(join(file, '..'), { recursive: true })
  writeFileSync(file, content, 'utf-8')
}

export function registerServerFileHandlers(): void {
  ipcMain.handle('servers:hostListFiles', (_event, serverId: string, relativeDir: string) =>
    listServerFiles(serverId, relativeDir)
  )
  ipcMain.handle('servers:hostReadFile', (_event, serverId: string, relativePath: string) =>
    readServerFile(serverId, relativePath)
  )
  ipcMain.handle('servers:hostWriteFile', (_event, serverId: string, relativePath: string, content: string) =>
    writeServerFile(serverId, relativePath, content)
  )
}
