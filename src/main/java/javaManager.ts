import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'

const execFileAsync = promisify(execFile)

export interface JavaInstallation {
  path: string
  version: string
}

// java prints its version to stderr, not stdout.
async function getJavaVersion(javaExecutable: string): Promise<string | null> {
  try {
    const { stderr, stdout } = await execFileAsync(javaExecutable, ['-version'])
    const match = `${stderr}\n${stdout}`.match(/version "([^"]+)"/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

const WINDOWS_JAVA_DIRS = [
  'C:\\Program Files\\Java',
  'C:\\Program Files\\Eclipse Adoptium',
  'C:\\Program Files\\BellSoft',
  'C:\\Program Files\\Microsoft',
  'C:\\Program Files (x86)\\Java'
]

function findWindowsJavaCandidates(): string[] {
  const candidates: string[] = []
  for (const dir of WINDOWS_JAVA_DIRS) {
    if (!existsSync(dir)) continue
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const javaExe = join(dir, entry.name, 'bin', 'java.exe')
      if (existsSync(javaExe)) candidates.push(javaExe)
    }
  }
  return candidates
}

export async function detectJavaInstallations(): Promise<JavaInstallation[]> {
  const candidates = new Set<string>(['java'])

  const javaHome = process.env.JAVA_HOME
  if (javaHome) {
    const exe = join(javaHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java')
    if (existsSync(exe)) candidates.add(exe)
  }

  if (process.platform === 'win32') {
    for (const candidate of findWindowsJavaCandidates()) candidates.add(candidate)
  }

  const results: JavaInstallation[] = []
  for (const candidate of candidates) {
    const version = await getJavaVersion(candidate)
    if (version) results.push({ path: candidate, version })
  }
  return results
}

export function registerJavaHandlers(): void {
  ipcMain.handle('java:detect', () => detectJavaInstallations())
}
