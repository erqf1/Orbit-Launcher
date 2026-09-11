import { ipcMain, dialog } from 'electron'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { refocusMainWindow } from '../windowFocus'

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

// A version string's leading number - "17.0.9" -> 17, the legacy "1.8.0_392"
// -> 8 (Java's own pre-9 numbering quirk: "1.N" meant major version N).
// Exported for reuse by findCompatibleJavaInstallation below and by
// crashDiagnosis.ts, so there's one place that knows how to read a major
// version out of either a `java -version` string or this same field on a
// detected JavaInstallation.
export function javaMajorVersion(version: string): number | null {
  const legacy = /^1\.(\d+)/.exec(version)
  if (legacy) return Number(legacy[1])
  const modern = /^(\d+)/.exec(version)
  return modern ? Number(modern[1]) : null
}

// Rough, advisory-only mapping of Minecraft version to the Java major
// version Mojang ships/requires for it - not exhaustive around exact
// version boundaries, only meant to catch an obviously wrong pairing (e.g.
// Java 8 selected for 1.21) rather than gate anything.
function requiredJavaMajorFor(mcVersion: string): number | null {
  // Capturing only the minor digits (the old /^1\.(\d+)/ regex) loses
  // version entirely, so a plain "minor >= 20.5" comparison can never be
  // true (minor is always a whole number) - this used to special-case
  // exactly "1.20.5" via a fragile mcVersion.includes('.5') string check,
  // which silently missed 1.20.6 (also a real MC version, also requiring
  // Java 21) and anything else in the 1.20.5+ range with a second decimal
  // (e.g. 1.20.10). Parsing the patch number explicitly and comparing
  // (minor, patch) properly fixes the whole 1.20.x boundary.
  const legacyMatch = /^1\.(\d+)(?:\.(\d+))?/.exec(mcVersion)
  if (legacyMatch) {
    const minor = Number(legacyMatch[1])
    const patch = Number(legacyMatch[2] ?? '0')
    if (minor > 20 || (minor === 20 && patch >= 5)) return 21
    if (minor >= 18) return 17
    if (minor >= 17) return 16
    return 8
  }
  // Mojang moved off the "1.x" version scheme in 2026 (current releases
  // look like "26.2"/"26.1.2" now, confirmed live against the real version
  // manifest elsewhere in this project) - every version under the new
  // scheme is current/modern, needing whatever Java Mojang requires for
  // new releases today. Without this branch, any current-era version
  // silently fell through to "no known requirement" (null) below, which is
  // exactly what let a too-old Java get used for a real 26.2 server
  // instead of being caught here.
  if (/^\d+\.\d+/.test(mcVersion)) return 21
  return null
}

export interface JavaCompatCheck {
  installedVersion: string | null
  installedMajor: number | null
  requiredMajor: number | null
  mismatch: boolean
}

export async function checkJavaCompat(javaPath: string, mcVersion: string): Promise<JavaCompatCheck> {
  const installedVersion = await getJavaVersion(javaPath || 'java')
  const installedMajor = installedVersion ? javaMajorVersion(installedVersion) : null
  const requiredMajor = requiredJavaMajorFor(mcVersion)
  const mismatch = installedMajor !== null && requiredMajor !== null && installedMajor < requiredMajor
  return { installedVersion, installedMajor, requiredMajor, mismatch }
}

export async function browseForJava(): Promise<JavaInstallation | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters:
      process.platform === 'win32' ? [{ name: 'Java', extensions: ['exe'] }] : [{ name: 'Alle Dateien', extensions: ['*'] }]
  })
  refocusMainWindow()
  if (result.canceled || result.filePaths.length === 0) return null
  const path = result.filePaths[0]
  const version = await getJavaVersion(path)
  if (!version) throw new Error('Diese Datei scheint keine gültige Java-Installation zu sein.')
  return { path, version }
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

// Prefers an exact major-version match over a merely-newer one (a newer
// major isn't guaranteed compatible with an older loader/version even
// though it usually is) - shared by crashDiagnosis.ts's auto-fix and
// serverProcess.ts's pre-flight check, so both pick a replacement Java the
// same way instead of duplicating this search.
export function findCompatibleJavaInstallation(
  installations: JavaInstallation[],
  requiredMajor: number
): JavaInstallation | null {
  const exact = installations.find((i) => javaMajorVersion(i.version) === requiredMajor)
  if (exact) return exact
  return installations.find((i) => (javaMajorVersion(i.version) ?? 0) >= requiredMajor) ?? null
}

export function registerJavaHandlers(): void {
  ipcMain.handle('java:detect', () => detectJavaInstallations())
  ipcMain.handle('java:browse', () => browseForJava())
  ipcMain.handle('java:checkCompat', (_e, javaPath: string, mcVersion: string) =>
    checkJavaCompat(javaPath, mcVersion)
  )
}
