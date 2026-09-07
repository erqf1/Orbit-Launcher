import { app, safeStorage } from 'electron'
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'

// Persists the msmc Xbox session token (from Xbox.save()) encrypted at
// rest via Electron's safeStorage (OS-backed: DPAPI on Windows), so
// signing in survives an app restart without keeping a raw refresh token
// in a plain JSON file.
function getAuthFilePath(): string {
  return join(app.getPath('userData'), 'auth.dat')
}

export function saveAuthToken(token: string): void {
  if (!safeStorage.isEncryptionAvailable()) return
  writeFileSync(getAuthFilePath(), safeStorage.encryptString(token))
}

export function loadAuthToken(): string | null {
  const filePath = getAuthFilePath()
  if (!existsSync(filePath) || !safeStorage.isEncryptionAvailable()) return null
  try {
    return safeStorage.decryptString(readFileSync(filePath))
  } catch {
    return null
  }
}

export function clearAuthToken(): void {
  const filePath = getAuthFilePath()
  if (existsSync(filePath)) unlinkSync(filePath)
}
