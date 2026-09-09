import { ipcMain } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getServerRoot, setServerEulaAccepted } from './serverManager'

function propertiesFile(id: string): string {
  return join(getServerRoot(id), 'server.properties')
}

export function readServerProperties(id: string): Record<string, string> {
  const file = propertiesFile(id)
  if (!existsSync(file)) return {}
  const result: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf-8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq === -1) continue
    result[line.slice(0, eq)] = line.slice(eq + 1)
  }
  return result
}

// Patches only the given keys, line by line, preserving every other line
// (comments, unknown keys Mojang added after this app was written, key
// order) exactly as-is - server.properties is meant to be a human-editable
// file, and a real Minecraft server writes a bunch of its own comments and
// keys into it on first boot that this app has no reason to understand or
// discard. Keys in the patch that don't already have a line get appended.
export function writeServerProperties(id: string, patch: Record<string, string>): void {
  const file = propertiesFile(id)
  const remaining = new Map(Object.entries(patch))
  const lines = existsSync(file) ? readFileSync(file, 'utf-8').split(/\r?\n/) : []

  const updated = lines.map((line) => {
    if (!line.trim() || line.trim().startsWith('#')) return line
    const eq = line.indexOf('=')
    if (eq === -1) return line
    const key = line.slice(0, eq)
    if (!remaining.has(key)) return line
    const value = remaining.get(key) as string
    remaining.delete(key)
    return `${key}=${value}`
  })

  for (const [key, value] of remaining) {
    updated.push(`${key}=${value}`)
  }

  writeFileSync(file, updated.join('\n'), 'utf-8')
}

function eulaFile(id: string): string {
  return join(getServerRoot(id), 'eula.txt')
}

export function isEulaAccepted(id: string): boolean {
  const file = eulaFile(id)
  if (!existsSync(file)) return false
  return /eula\s*=\s*true/i.test(readFileSync(file, 'utf-8'))
}

// The real eula.txt content real Minecraft servers write themselves - this
// app writes the same shape up front (rather than waiting for a first,
// EULA-rejecting boot) so a first launch doesn't need an extra restart
// after the server's own generated eula.txt shows up.
export function acceptEula(id: string): void {
  const contents = [
    '#By changing the setting below to TRUE you are indicating your agreement to our EULA (https://aka.ms/MinecraftEULA).',
    `#${new Date().toString()}`,
    'eula=true',
    ''
  ].join('\n')
  writeFileSync(eulaFile(id), contents, 'utf-8')
  setServerEulaAccepted(id, true)
}

export function registerServerPropertiesHandlers(): void {
  ipcMain.handle('servers:hostPropertiesRead', (_event, id: string) => readServerProperties(id))
  ipcMain.handle('servers:hostPropertiesWrite', (_event, id: string, patch: Record<string, string>) =>
    writeServerProperties(id, patch)
  )
  ipcMain.handle('servers:hostEulaAccept', (_event, id: string) => acceptEula(id))
  ipcMain.handle('servers:hostEulaStatus', (_event, id: string) => isEulaAccepted(id))
}
