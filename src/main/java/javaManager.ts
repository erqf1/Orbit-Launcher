import { ipcMain } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

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

function javaExecutableName(): string {
  return process.platform === 'win32' ? 'java.exe' : 'java'
}

// Parent directories that hold one subfolder per JDK/JRE install
// (<dir>/<name>/bin/java[.exe]). Not exhaustive, but covers how the
// mainstream distributions of Java land on each OS.
function candidateParentDirs(): string[] {
  switch (process.platform) {
    case 'win32':
      return [
        'C:\\Program Files\\Java',
        'C:\\Program Files\\Eclipse Adoptium',
        'C:\\Program Files\\BellSoft',
        'C:\\Program Files\\Microsoft',
        'C:\\Program Files (x86)\\Java'
      ]
    case 'linux':
      return [
        '/usr/lib/jvm',
        '/usr/lib64/jvm',
        '/opt/java',
        join(homedir(), '.sdkman/candidates/java')
      ]
    default:
      return []
  }
}

// Scans each parent dir's immediate subentries for <entry>/bin/java. Doesn't
// pre-filter by entry type (dir vs symlink) - Linux JVM dirs are commonly
// symlinks (e.g. /usr/lib/jvm/default-java), and existsSync resolves those
// transparently, so it's simpler and more correct to just try every entry.
function findCandidatesInParentDirs(): string[] {
  const exe = javaExecutableName()
  const candidates: string[] = []
  for (const parent of candidateParentDirs()) {
    if (!existsSync(parent)) continue
    let entries: string[]
    try {
      entries = readdirSync(parent)
    } catch {
      continue
    }
    for (const entry of entries) {
      const javaPath = join(parent, entry, 'bin', exe)
      if (existsSync(javaPath)) candidates.push(javaPath)
    }
  }
  return candidates
}

export async function detectJavaInstallations(): Promise<JavaInstallation[]> {
  const candidates = new Set<string>(['java'])

  const javaHome = process.env.JAVA_HOME
  if (javaHome) {
    const exe = join(javaHome, 'bin', javaExecutableName())
    if (existsSync(exe)) candidates.add(exe)
  }

  for (const candidate of findCandidatesInParentDirs()) candidates.add(candidate)

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
