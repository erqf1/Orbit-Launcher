import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'fs'
import { join } from 'path'

// Each account's msmc Xbox session token (from Xbox.save()) is persisted
// encrypted at rest via Electron's safeStorage (OS-backed: DPAPI on
// Windows) in its own file, named by Minecraft profile id. A small plain
// JSON index tracks which accounts are known (id + display name only -
// nothing sensitive) and which one is currently active. This replaces the
// single-account `auth.dat` this app used before - no migration from that
// file, it's just left orphaned; re-adding an account once after updating
// is a low enough cost for a Node app with no other schema-migration
// precedent anywhere else in this project.
export interface SavedAccountMeta {
  id: string
  name: string
}

interface AccountsIndex {
  activeId: string | null
  accounts: SavedAccountMeta[]
  // When true, the renderer asks which saved account to launch with every
  // time "Play" is pressed (for a shared PC/multiple people using the same
  // launcher) instead of always using the persisted active account.
  askOnPlay?: boolean
}

function getAccountsDir(): string {
  const dir = join(app.getPath('userData'), 'accounts')
  mkdirSync(dir, { recursive: true })
  return dir
}

function getIndexPath(): string {
  return join(getAccountsDir(), 'index.json')
}

function getTokenPath(id: string): string {
  return join(getAccountsDir(), `${id}.dat`)
}

function readIndex(): AccountsIndex {
  const file = getIndexPath()
  if (!existsSync(file)) return { activeId: null, accounts: [] }
  try {
    return JSON.parse(readFileSync(file, 'utf-8')) as AccountsIndex
  } catch {
    return { activeId: null, accounts: [] }
  }
}

function writeIndex(index: AccountsIndex): void {
  writeFileSync(getIndexPath(), JSON.stringify(index, null, 2), 'utf-8')
}

export function listSavedAccounts(): SavedAccountMeta[] {
  return readIndex().accounts
}

export function getActiveAccountId(): string | null {
  return readIndex().activeId
}

export function setActiveAccountId(id: string | null): void {
  const index = readIndex()
  index.activeId = id
  writeIndex(index)
}

export function getAskOnPlay(): boolean {
  return readIndex().askOnPlay ?? false
}

export function setAskOnPlay(value: boolean): void {
  const index = readIndex()
  index.askOnPlay = value
  writeIndex(index)
}

export function saveAccountToken(id: string, name: string, token: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  writeFileSync(getTokenPath(id), safeStorage.encryptString(token))

  const index = readIndex()
  const existing = index.accounts.find((a) => a.id === id)
  if (existing) existing.name = name
  else index.accounts.push({ id, name })
  writeIndex(index)
}

export function loadAccountToken(id: string): string | null {
  const filePath = getTokenPath(id)
  if (!existsSync(filePath) || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(filePath))
  } catch {
    return null
  }
}

export function removeAccount(id: string): void {
  const filePath = getTokenPath(id)
  if (existsSync(filePath)) unlinkSync(filePath)

  const index = readIndex()
  index.accounts = index.accounts.filter((a) => a.id !== id)
  if (index.activeId === id) index.activeId = index.accounts[0]?.id ?? null
  writeIndex(index)
}
