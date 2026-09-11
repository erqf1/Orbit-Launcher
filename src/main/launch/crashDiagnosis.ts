import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getInstance, getInstanceRoot } from '../instances/instanceManager'
import { checkJavaCompat, detectJavaInstallations, findCompatibleJavaInstallation } from '../java/javaManager'
import { resolveModEnvironment, getRequiredDependencies, mapWithConcurrency } from '../mods/modrinth'

// Deliberately bounded to the most reliably-detectable, common cases rather
// than attempting general crash-report parsing - duplicate-mod-jar
// detection, Forge/NeoForge-specific signatures (their crash reports have a
// very different shape), and full "-- Head --"/"-- System Details --"
// Minecraft-crash-report-format parsing are real gaps, left as follow-ups
// rather than built speculatively here.
export type CrashDiagnosis =
  | { kind: 'oom'; currentMemoryMax: string; suggestedMemoryMax: string }
  | { kind: 'javaMismatch'; installedMajor: number | null; requiredMajor: number; suggestedJavaPath: string | null }
  | {
      kind: 'missingDependency'
      modTitle: string
      missingDepTitle: string
      missingDepProjectId: string
      missingDepVersionId: string
      missingDepFile: { url: string; filename: string }
      // Filename of an already-installed jar for this dependency's project
      // that is NOT the required version - set when the dependency isn't
      // simply absent but present at an incompatible version (e.g. an old
      // Sodium jar installed before Iris). null when nothing for this
      // project is installed at all.
      missingDepInstalledFilename: string | null
    }
  | { kind: 'unknown' }

// A runtime java.lang.OutOfMemoryError (heap exhausted while playing) is far
// from the only real-world "out of memory" shape - by far the more common
// one in practice is the JVM refusing to even *start* because -Xmx was set
// higher than the machine actually has available, which never throws
// OutOfMemoryError at all: HotSpot just prints one of these and exits before
// Minecraft's own code ever runs. Missing these meant the single most common
// memory misconfiguration was silently falling through to "unknown".
const OOM_PATTERN =
  /OutOfMemoryError|Could not reserve enough space for object heap|insufficient memory for the Java Runtime Environment|Invalid maximum heap size/i
// Covers plain JVM class-loading failures, Fabric/Quilt's own
// mixin-apply-failure wording, AND fabric-loader's/quilt-loader's *own*
// pre-flight dependency-resolution failure (ModResolutionException /
// "incompatible mod set" / "which is missing!") - in practice that pre-flight
// check is the most common way a missing required mod actually surfaces on
// these loaders, and it happens before any class is ever touched, so it
// never produces a ClassNotFoundException/NoClassDefFoundError/Mixin error -
// missing it meant this, the headline "missing dependency" case, was never
// detected. Not a Forge/NeoForge-specific signature.
const MISSING_CLASS_PATTERN =
  /ClassNotFoundException|NoClassDefFoundError|Mixin apply failed|ModResolutionException|which is missing!|incompatible mod set/i

// A mod jar's max memory as "1234M"/"2G" -> raw megabytes, so bumping it is
// simple arithmetic regardless of which unit the user's own value used.
function parseMemoryToMb(value: string): number | null {
  const match = /^(\d+)([MG])$/i.exec(value.trim())
  if (!match) return null
  const amount = Number(match[1])
  return match[2].toUpperCase() === 'G' ? amount * 1024 : amount
}

function formatMbAsMemory(mb: number): string {
  return mb % 1024 === 0 ? `${mb / 1024}G` : `${mb}M`
}

async function findMissingDependency(
  instanceId: string,
  mcVersion: string,
  loader: string
): Promise<{
  modTitle: string
  missingDepTitle: string
  missingDepProjectId: string
  missingDepVersionId: string
  missingDepFile: { url: string; filename: string }
  missingDepInstalledFilename: string | null
} | null> {
  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  if (!existsSync(modsDir)) return null
  const files = readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar'))
  if (files.length === 0) return null

  const resolved = await mapWithConcurrency(files, 6, (filename) =>
    resolveModEnvironment(join(modsDir, filename))
  )

  for (const mod of resolved) {
    if (!mod) continue
    const deps = await getRequiredDependencies(mod.projectId, mcVersion, loader, { instanceId }).catch(() => [])
    // A dependency only counts as satisfied when the exact required version
    // is what's actually on disk - not merely "some version of this project
    // exists". An old Sodium jar installed before Iris (or a newer one
    // grabbed independently) is a real project match but not necessarily
    // the build Iris was tested against; treating mere presence as
    // "satisfied" is exactly why the Iris/Sodium version-mismatch crash was
    // never caught here before.
    const missing = deps.find((dep) => !dep.installed || dep.installed.versionId !== dep.versionId)
    if (missing) {
      return {
        modTitle: mod.title,
        missingDepTitle: missing.title,
        missingDepProjectId: missing.projectId,
        missingDepVersionId: missing.versionId,
        missingDepFile: missing.file,
        missingDepInstalledFilename: missing.installed?.filename ?? null
      }
    }
  }
  return null
}

// Called from launcher.ts's launch:closed handler once a launch's
// accumulated log text is known, only when the process actually exited
// non-zero - a normal quit (code 0) is never diagnosed.
export async function diagnoseCrash(instanceId: string, logText: string): Promise<CrashDiagnosis> {
  const instance = getInstance(instanceId)
  if (!instance) return { kind: 'unknown' }

  if (OOM_PATTERN.test(logText)) {
    const currentMb = parseMemoryToMb(instance.memoryMax) ?? 2048
    return {
      kind: 'oom',
      currentMemoryMax: instance.memoryMax,
      suggestedMemoryMax: formatMbAsMemory(currentMb + 2048)
    }
  }

  const compat = await checkJavaCompat(instance.javaPath || 'java', instance.mcVersion)
  if (compat.mismatch && compat.requiredMajor !== null) {
    const installations = await detectJavaInstallations()
    const match = findCompatibleJavaInstallation(installations, compat.requiredMajor)
    return {
      kind: 'javaMismatch',
      installedMajor: compat.installedMajor,
      requiredMajor: compat.requiredMajor,
      suggestedJavaPath: match?.path ?? null
    }
  }

  if (MISSING_CLASS_PATTERN.test(logText) && instance.loader !== 'vanilla') {
    const missing = await findMissingDependency(instanceId, instance.mcVersion, instance.loader)
    if (missing) return { kind: 'missingDependency', ...missing }
  }

  return { kind: 'unknown' }
}
