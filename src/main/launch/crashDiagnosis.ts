import { readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { getInstance, getInstanceRoot } from '../instances/instanceManager'
import { checkJavaCompat, detectJavaInstallations } from '../java/javaManager'
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
  | { kind: 'missingDependency'; modTitle: string; missingDepTitle: string; missingDepProjectId: string }
  | { kind: 'unknown' }

const OOM_PATTERN = /OutOfMemoryError/
// Covers both plain JVM class-loading failures and Fabric/Quilt's own
// mixin-apply-failure wording (the most common "a required mod isn't
// installed" shape for the loaders this app can actually resolve a mods/
// folder against Modrinth for) - not a Forge/NeoForge-specific signature.
const MISSING_CLASS_PATTERN = /ClassNotFoundException|NoClassDefFoundError|Mixin apply failed/

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
): Promise<{ modTitle: string; missingDepTitle: string; missingDepProjectId: string } | null> {
  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  if (!existsSync(modsDir)) return null
  const files = readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar'))
  if (files.length === 0) return null

  const resolved = await mapWithConcurrency(files, 6, (filename) =>
    resolveModEnvironment(join(modsDir, filename))
  )
  const installedProjectIds = new Set(resolved.filter((r) => r !== null).map((r) => r!.projectId))

  for (const mod of resolved) {
    if (!mod) continue
    const deps = await getRequiredDependencies(mod.projectId, mcVersion, loader).catch(() => [])
    const missing = deps.find((dep) => !installedProjectIds.has(dep.projectId))
    if (missing) {
      return { modTitle: mod.title, missingDepTitle: missing.title, missingDepProjectId: missing.projectId }
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
    const exact = installations.find((i) => {
      const major = /^1\.(\d+)/.exec(i.version)?.[1] ?? /^(\d+)/.exec(i.version)?.[1]
      return major !== undefined && Number(major) === compat.requiredMajor
    })
    return {
      kind: 'javaMismatch',
      installedMajor: compat.installedMajor,
      requiredMajor: compat.requiredMajor,
      suggestedJavaPath: exact?.path ?? null
    }
  }

  if (MISSING_CLASS_PATTERN.test(logText) && instance.loader !== 'vanilla') {
    const missing = await findMissingDependency(instanceId, instance.mcVersion, instance.loader)
    if (missing) return { kind: 'missingDependency', ...missing }
  }

  return { kind: 'unknown' }
}
