import { ipcMain, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { createHash } from 'crypto'
import { basename, join } from 'path'
import { getInstanceRoot } from '../instances/instanceManager'

const MODRINTH_API = 'https://api.modrinth.com/v2'
const DISABLED_SUFFIX = '.disabled'

export interface ModSearchResult {
  projectId: string
  slug: string
  title: string
  description: string
  iconUrl: string | null
  downloads: number
}

export interface ModVersionSummary {
  id: string
  versionNumber: string
  filename: string
  url: string
  requiredDependencyProjectIds: string[]
}

export interface ModFileRef {
  url: string
  filename: string
}

export interface InstalledMod {
  filename: string
  enabled: boolean
}

export interface ModMigrationResult {
  migrated: Array<{ oldFilename: string; newFilename: string; title: string }>
  failed: Array<{ oldFilename: string; title: string | null; reason: string }>
}

function assertSafeFilename(filename: string): void {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Ungültiger Dateiname.')
  }
}

interface ModrinthSearchHit {
  project_id: string
  slug: string
  title: string
  description: string
  icon_url: string | null
  downloads: number
}

function mapSearchHit(hit: ModrinthSearchHit): ModSearchResult {
  return {
    projectId: hit.project_id,
    slug: hit.slug,
    title: hit.title,
    description: hit.description,
    iconUrl: hit.icon_url,
    downloads: hit.downloads
  }
}

export async function searchMods(
  query: string,
  mcVersion: string,
  loader: string
): Promise<ModSearchResult[]> {
  const facets = [
    ['project_type:mod'],
    [`versions:${mcVersion}`],
    ...(loader !== 'vanilla' ? [[`categories:${loader}`]] : [])
  ]
  const url = `${MODRINTH_API}/search?query=${encodeURIComponent(query)}&limit=20&facets=${encodeURIComponent(JSON.stringify(facets))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Modrinth-Suche fehlgeschlagen (HTTP ${res.status}).`)
  const data = (await res.json()) as { hits: ModrinthSearchHit[] }
  return data.hits.map(mapSearchHit)
}

// Unscoped by mc version/loader - used only to guess "does this filename
// plausibly name a real Modrinth project", not to find something
// install-ready.
async function searchModsByNameOnly(query: string): Promise<ModSearchResult[]> {
  const facets = [['project_type:mod']]
  const url = `${MODRINTH_API}/search?query=${encodeURIComponent(query)}&limit=5&facets=${encodeURIComponent(JSON.stringify(facets))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Modrinth-Suche fehlgeschlagen (HTTP ${res.status}).`)
  const data = (await res.json()) as { hits: ModrinthSearchHit[] }
  return data.hits.map(mapSearchHit)
}

export async function getProjectInfo(projectId: string): Promise<ModSearchResult> {
  const res = await fetch(`${MODRINTH_API}/project/${encodeURIComponent(projectId)}`)
  if (!res.ok) throw new Error(`Mod-Info konnte nicht geladen werden (HTTP ${res.status}).`)
  const p = (await res.json()) as {
    id: string
    slug: string
    title: string
    description: string
    icon_url: string | null
    downloads: number
  }
  return {
    projectId: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    iconUrl: p.icon_url,
    downloads: p.downloads
  }
}

export async function listModVersions(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModVersionSummary[]> {
  const loaders = loader === 'vanilla' ? [] : [loader]
  const url = `${MODRINTH_API}/project/${encodeURIComponent(projectId)}/version?loaders=${encodeURIComponent(JSON.stringify(loaders))}&game_versions=${encodeURIComponent(JSON.stringify([mcVersion]))}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Mod-Versionen konnten nicht geladen werden (HTTP ${res.status}).`)
  const versions = (await res.json()) as Array<{
    id: string
    version_number: string
    files: Array<{ url: string; filename: string; primary: boolean }>
    dependencies: Array<{ project_id: string | null; dependency_type: string }>
  }>
  const summaries: ModVersionSummary[] = []
  for (const v of versions) {
    const file = v.files.find((f) => f.primary) ?? v.files[0]
    if (!file) continue
    const requiredDependencyProjectIds = v.dependencies
      .filter((d) => d.dependency_type === 'required' && d.project_id)
      .map((d) => d.project_id as string)
    summaries.push({
      id: v.id,
      versionNumber: v.version_number,
      filename: file.filename,
      url: file.url,
      requiredDependencyProjectIds
    })
  }
  return summaries
}

// Resolves the required-dependency project IDs on a mod's best-matching
// version into full project info, so the UI can show names before
// installing (rather than the user finding out mid-game via a crash log).
export async function getRequiredDependencies(
  projectId: string,
  mcVersion: string,
  loader: string
): Promise<ModSearchResult[]> {
  const versions = await listModVersions(projectId, mcVersion, loader)
  const best = versions[0]
  if (!best || best.requiredDependencyProjectIds.length === 0) return []

  const infos = await Promise.all(
    best.requiredDependencyProjectIds.map((id) => getProjectInfo(id).catch(() => null))
  )
  return infos.filter((info): info is ModSearchResult => info !== null)
}

export async function installMod(instanceId: string, file: ModFileRef): Promise<void> {
  assertSafeFilename(file.filename)

  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  mkdirSync(modsDir, { recursive: true })

  const res = await fetch(file.url)
  if (!res.ok) throw new Error(`Mod-Download fehlgeschlagen (HTTP ${res.status}).`)

  const buffer = Buffer.from(await res.arrayBuffer())
  writeFileSync(join(modsDir, file.filename), buffer)
}

// Disabled mods are kept on disk with a ".disabled" suffix rather than a
// separate folder - every mod loader only scans for files literally ending
// in ".jar", so this is the universal, loader-agnostic way to turn a mod
// off without uninstalling it (the same convention Prism Launcher and most
// other launchers use).
export function listInstalledMods(instanceId: string): InstalledMod[] {
  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  if (!existsSync(modsDir)) return []
  return readdirSync(modsDir)
    .filter((f) => f.toLowerCase().endsWith('.jar') || f.toLowerCase().endsWith(`.jar${DISABLED_SUFFIX}`))
    .map((f) => ({ filename: f, enabled: !f.endsWith(DISABLED_SUFFIX) }))
}

export function toggleModEnabled(instanceId: string, filename: string): void {
  assertSafeFilename(filename)
  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  const from = join(modsDir, filename)
  if (!existsSync(from)) throw new Error('Mod-Datei nicht gefunden.')
  const to = filename.endsWith(DISABLED_SUFFIX)
    ? join(modsDir, filename.slice(0, -DISABLED_SUFFIX.length))
    : join(modsDir, `${filename}${DISABLED_SUFFIX}`)
  renameSync(from, to)
}

export function removeMod(instanceId: string, filename: string): void {
  assertSafeFilename(filename)
  const target = join(getInstanceRoot(instanceId), 'mods', filename)
  if (existsSync(target)) rmSync(target)
}

// Copies already-downloaded jar files directly instead of re-resolving them
// on Modrinth - callers (the UI) are responsible for only offering instances
// with a matching loader+version as targets, since a copied jar isn't
// re-validated for compatibility the way a fresh install would be.
export function copyMods(sourceInstanceId: string, targetInstanceId: string, filenames: string[]): void {
  const sourceDir = join(getInstanceRoot(sourceInstanceId), 'mods')
  const targetDir = join(getInstanceRoot(targetInstanceId), 'mods')
  mkdirSync(targetDir, { recursive: true })
  for (const filename of filenames) {
    assertSafeFilename(filename)
    const src = join(sourceDir, filename)
    if (!existsSync(src)) continue
    copyFileSync(src, join(targetDir, filename))
  }
}

async function lookupProjectIdByFileHash(sha1: string): Promise<string | null> {
  const res = await fetch(`${MODRINTH_API}/version_file/${sha1}?algorithm=sha1`)
  if (!res.ok) return null
  const v = (await res.json()) as { project_id: string }
  return v.project_id
}

// Used when changing an instance's Minecraft version/loader: each
// currently-installed (enabled) mod jar is identified by its file hash via
// Modrinth's file-lookup endpoint (the only reliable way to map an
// arbitrary jar back to a project - mods can be installed via search,
// curated list, Prism import, or manual copy, none of which necessarily
// recorded a project id), then re-resolved against the new version/loader.
// Mods Modrinth doesn't recognize at all, or that have no build for the
// new version/loader, are reported back rather than silently dropped.
export async function migrateMods(
  instanceId: string,
  mcVersion: string,
  loader: string
): Promise<ModMigrationResult> {
  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  const mods = listInstalledMods(instanceId).filter((m) => m.enabled)
  const migrated: ModMigrationResult['migrated'] = []
  const failed: ModMigrationResult['failed'] = []

  for (const mod of mods) {
    const filePath = join(modsDir, mod.filename)
    let title: string | null = null
    try {
      const sha1 = createHash('sha1').update(readFileSync(filePath)).digest('hex')
      const projectId = await lookupProjectIdByFileHash(sha1)
      if (!projectId) {
        failed.push({ oldFilename: mod.filename, title: null, reason: 'Nicht auf Modrinth gefunden.' })
        continue
      }
      title = (await getProjectInfo(projectId).catch(() => null))?.title ?? projectId

      const versions = await listModVersions(projectId, mcVersion, loader)
      const best = versions[0]
      if (!best) {
        failed.push({
          oldFilename: mod.filename,
          title,
          reason: `Keine Version für ${mcVersion} (${loader}) verfügbar.`
        })
        continue
      }

      await installMod(instanceId, { url: best.url, filename: best.filename })
      if (best.filename !== mod.filename) rmSync(filePath, { force: true })
      migrated.push({ oldFilename: mod.filename, newFilename: best.filename, title })
    } catch (err) {
      failed.push({ oldFilename: mod.filename, title, reason: err instanceof Error ? err.message : String(err) })
    }
  }

  return { migrated, failed }
}

export interface ModCheckResult {
  status: 'verified' | 'nameMismatch' | 'unrecognized'
  filePath: string
  filename: string
  matchedProject?: { projectId: string; title: string; slug: string }
  matchedVersionNumber?: string
  claimedProject?: { projectId: string; title: string; slug: string }
}

const KNOWN_LOADER_WORDS = new Set(['fabric', 'forge', 'neoforge', 'quilt', 'legacyfabric', 'rift'])

// Turns a filename like "sodium-fabric-0.5.8.jar" into a plausible search
// term ("sodium") by dropping version-number-shaped segments and loader
// qualifiers - but only drops a loader word if it isn't the very first
// segment, since real project names can legitimately start with one
// ("Fabric API", "Fabric Language Kotlin"). Verified live against Modrinth
// search: "sodium fabric" as a raw query returns unrelated results before
// this filtering, "sodium" alone returns Sodium as the top hit; "fabric
// api" (loader word kept because it leads) correctly returns Fabric API.
function guessProjectNameFromFilename(filename: string): string | null {
  const base = filename.replace(/\.jar$/i, '')
  const segments = base.split(/[-_+]+/).filter(Boolean)
  const kept: string[] = []
  segments.forEach((seg, i) => {
    if (/^v?\d/.test(seg)) return
    if (/^mc\d/i.test(seg)) return
    if (i > 0 && KNOWN_LOADER_WORDS.has(seg.toLowerCase())) return
    kept.push(seg)
  })
  const guess = kept.join(' ').trim()
  return guess.length >= 3 ? guess : null
}

function normalizeForMatch(s: string): string {
  return s.toLowerCase().replace(/[-_\s]+/g, ' ').trim()
}

async function resolveClaimedProject(
  guess: string | null
): Promise<{ projectId: string; title: string; slug: string } | null> {
  if (!guess) return null
  const hits = await searchModsByNameOnly(guess).catch(() => [])
  const top = hits[0]
  if (top && normalizeForMatch(top.slug) === normalizeForMatch(guess)) {
    return { projectId: top.projectId, title: top.title, slug: top.slug }
  }
  return null
}

// Checks whether a mod jar picked from anywhere on disk (e.g. one someone
// sent over Discord) is a genuine, unmodified Modrinth release - not just
// "does a mod with this name exist", but "is *this exact file* byte-for-
// byte what Modrinth actually published". A hash match is the only real
// proof; a filename alone proves nothing (that's exactly what someone
// impersonating a mod would fake).
//
// Modrinth's file records only carry sha1 and sha512 - no sha256, despite
// that being the more obvious guess - confirmed live: the same file 200s
// on /version_file/{sha1} and 404s on the sha256 variant, and the returned
// file's `hashes` object simply has no sha256 key. sha1 is used here for
// exactly that reason, not as a weaker default.
//
// A hash match alone isn't the whole story: caught empirically while
// testing this (a real, unmodified mod jar copied and renamed to look like
// Sodium) - the file is a 100% genuine Modrinth release, just not of the
// project its filename claims. That's arguably the more realistic
// impersonation than a fully fake file, so a hash match is additionally
// cross-checked against what the filename claims, and downgraded to
// nameMismatch (with *both* the real matched project and the claimed one
// populated) if they disagree.
export async function checkModFile(filePath: string): Promise<ModCheckResult> {
  const filename = basename(filePath)
  const sha1 = createHash('sha1').update(readFileSync(filePath)).digest('hex')
  const guess = guessProjectNameFromFilename(filename)

  const directRes = await fetch(`${MODRINTH_API}/version_file/${sha1}?algorithm=sha1`)
  if (directRes.ok) {
    const version = (await directRes.json()) as { project_id: string; version_number: string }
    const project = await getProjectInfo(version.project_id).catch(() => null)
    const matchedProject = project
      ? { projectId: project.projectId, title: project.title, slug: project.slug }
      : undefined

    if (guess && matchedProject && normalizeForMatch(matchedProject.slug) !== normalizeForMatch(guess)) {
      const claimedProject = await resolveClaimedProject(guess)
      return {
        status: 'nameMismatch',
        filePath,
        filename,
        matchedProject,
        matchedVersionNumber: version.version_number,
        claimedProject: claimedProject ?? undefined
      }
    }

    return { status: 'verified', filePath, filename, matchedProject, matchedVersionNumber: version.version_number }
  }

  // Not byte-identical to anything Modrinth has - if the filename
  // confidently names a real project (exact match after normalizing),
  // that's a specific, actionable warning ("claims to be X, isn't a real
  // X release") rather than a generic shrug.
  const claimedProject = await resolveClaimedProject(guess)
  if (claimedProject) {
    return { status: 'nameMismatch', filePath, filename, claimedProject }
  }

  return { status: 'unrecognized', filePath, filename }
}

export async function pickAndCheckModFile(): Promise<ModCheckResult | null> {
  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Mod-Datei', extensions: ['jar'] }]
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return checkModFile(result.filePaths[0])
}

// Copies a file from anywhere on disk (typically one just run through
// checkModFile) into an instance's mods folder - used for "install anyway"
// after a warning, or straightforward install after a clean check.
export function installModFromFile(instanceId: string, filePath: string): void {
  const modsDir = join(getInstanceRoot(instanceId), 'mods')
  mkdirSync(modsDir, { recursive: true })
  copyFileSync(filePath, join(modsDir, basename(filePath)))
}

export function registerModHandlers(): void {
  ipcMain.handle('mods:search', (_event, query: string, mcVersion: string, loader: string) =>
    searchMods(query, mcVersion, loader)
  )
  ipcMain.handle('mods:versions', (_event, projectId: string, mcVersion: string, loader: string) =>
    listModVersions(projectId, mcVersion, loader)
  )
  ipcMain.handle(
    'mods:dependencies',
    (_event, projectId: string, mcVersion: string, loader: string) =>
      getRequiredDependencies(projectId, mcVersion, loader)
  )
  ipcMain.handle('mods:install', (_event, instanceId: string, file: ModFileRef) =>
    installMod(instanceId, file)
  )
  ipcMain.handle('mods:list', (_event, instanceId: string) => listInstalledMods(instanceId))
  ipcMain.handle('mods:remove', (_event, instanceId: string, filename: string) =>
    removeMod(instanceId, filename)
  )
  ipcMain.handle('mods:toggleEnabled', (_event, instanceId: string, filename: string) =>
    toggleModEnabled(instanceId, filename)
  )
  ipcMain.handle(
    'mods:copyTo',
    (_event, sourceInstanceId: string, targetInstanceId: string, filenames: string[]) =>
      copyMods(sourceInstanceId, targetInstanceId, filenames)
  )
  ipcMain.handle('mods:migrate', (_event, instanceId: string, mcVersion: string, loader: string) =>
    migrateMods(instanceId, mcVersion, loader)
  )
  ipcMain.handle('mods:pickAndCheckFile', () => pickAndCheckModFile())
  ipcMain.handle('mods:installFromFile', (_event, instanceId: string, filePath: string) =>
    installModFromFile(instanceId, filePath)
  )
}
