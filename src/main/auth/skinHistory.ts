import { ipcMain, app } from 'electron'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'

export interface SkinHistoryEntry {
  id: string
  skinUrl: string
  variant: 'CLASSIC' | 'SLIM'
  appliedAt: string
}

// Mojang's own account only ever tracks the *currently* equipped skin - it
// doesn't keep a history of everything an account has worn (verified live:
// the profile endpoint's `skins` array only ever contains the single ACTIVE
// entry in the modern API). So a "skins you had before" picker (the whole
// point of this file) has to be this app's own local record, built up going
// forward from every change made through it - not something re-derivable
// from Mojang's side after the fact.
const MAX_ENTRIES_PER_ACCOUNT = 20

function getHistoryFile(): string {
  return join(app.getPath('userData'), 'skinHistory.json')
}

function readAll(): Record<string, SkinHistoryEntry[]> {
  const file = getHistoryFile()
  if (!existsSync(file)) return {}
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as Record<string, SkinHistoryEntry[]>
  } catch {
    return {}
  }
}

function writeAll(data: Record<string, SkinHistoryEntry[]>): void {
  writeFileSync(getHistoryFile(), JSON.stringify(data, null, 2), 'utf-8')
}

export function listSkinHistory(accountId: string): SkinHistoryEntry[] {
  return readAll()[accountId] ?? []
}

// Mojang's skin URLs are content-addressed (a hash of the texture bytes,
// e.g. textures.minecraft.net/texture/<hash>) - re-equipping a history entry
// later never risks pointing at a since-changed image, and a skin re-applied
// unchanged just produces the same URL again, which is exactly the case this
// dedupes against skipping a pointless duplicate entry.
export function recordSkinHistory(accountId: string, skinUrl: string, variant: 'CLASSIC' | 'SLIM'): void {
  const all = readAll()
  const existing = all[accountId] ?? []
  if (existing[0]?.skinUrl === skinUrl && existing[0]?.variant === variant) return

  const entry: SkinHistoryEntry = { id: randomUUID(), skinUrl, variant, appliedAt: new Date().toISOString() }
  all[accountId] = [entry, ...existing].slice(0, MAX_ENTRIES_PER_ACCOUNT)
  writeAll(all)
}

export function removeSkinHistoryEntry(accountId: string, entryId: string): SkinHistoryEntry[] {
  const all = readAll()
  all[accountId] = (all[accountId] ?? []).filter((e) => e.id !== entryId)
  writeAll(all)
  return all[accountId]
}

export function registerSkinHistoryHandlers(): void {
  ipcMain.handle('skinHistory:list', (_event, accountId: string) => listSkinHistory(accountId))
  ipcMain.handle('skinHistory:remove', (_event, accountId: string, entryId: string) =>
    removeSkinHistoryEntry(accountId, entryId)
  )
}
