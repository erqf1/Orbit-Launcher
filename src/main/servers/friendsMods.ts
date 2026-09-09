import { ipcMain, dialog } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import AdmZip from 'adm-zip'
import { getServerRoot, getServer } from './serverManager'
import { getInstanceRoot } from '../instances/instanceManager'
import {
  resolveModEnvironment,
  mapWithConcurrency,
  assertSafeFilename,
  classifyModEnvironment,
  canRunOnServer,
  type ModServerCompat,
  type ResolvedModEnvironment
} from '../mods/modrinth'
import { refocusMainWindow } from '../windowFocus'

export interface FriendsModEntry {
  filename: string
  title: string
  environment: string
  compat: ModServerCompat
  // false for a jar Modrinth couldn't identify at all by hash - still
  // included in the export (bundled directly, see buildMrpack), just
  // without Modrinth-hosted download metadata.
  resolved: boolean
  // The default checkbox state buildMrpack's caller should show pre-ticked
  // - true unless compat unambiguously says server-only.
  suggestedInclude: boolean
}

// Deliberately defaults to *including* anything ambiguous (an unrecognized
// environment string, or a jar Modrinth doesn't know at all) rather than
// excluding it - a friend getting one extra mod they didn't strictly need
// is a much smaller problem than a friend missing a mod that was actually
// required, which is the whole point of this feature. The user still gets
// a checklist (FriendsModsTab.tsx) to override any of this before export.
export async function scanServerMods(serverId: string): Promise<FriendsModEntry[]> {
  const modsDir = join(getServerRoot(serverId), 'mods')
  if (!existsSync(modsDir)) return []
  const files = readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.jar'))

  return mapWithConcurrency(files, 6, async (filename) => {
    const resolved = await resolveModEnvironment(join(modsDir, filename))
    if (!resolved) {
      return {
        filename,
        title: filename,
        environment: 'unknown',
        compat: 'clientAndServer' as const,
        resolved: false,
        suggestedInclude: true
      }
    }
    const compat = classifyModEnvironment(resolved.environment)
    return {
      filename,
      title: resolved.title,
      environment: resolved.environment,
      compat,
      resolved: true,
      suggestedInclude: compat !== 'serverOnly'
    }
  })
}

interface MrpackFile {
  path: string
  hashes: { sha1: string; sha512: string }
  env: { client: string; server: string }
  downloads: string[]
  fileSize: number
}

// Builds a real Modrinth .mrpack (not a custom format) so the result is
// importable by Prism Launcher / the Modrinth App too, not just this app -
// see the format spec: a zip with modrinth.index.json at the root plus an
// optional overrides/ folder for anything that isn't a plain Modrinth-hosted
// file reference.
export async function buildMrpack(
  serverId: string,
  selectedFilenames: string[],
  savePath: string
): Promise<void> {
  const server = getServer(serverId)
  if (!server) throw new Error('Server nicht gefunden.')
  for (const filename of selectedFilenames) assertSafeFilename(filename)
  const modsDir = join(getServerRoot(serverId), 'mods')

  const files: MrpackFile[] = []
  const overrideFiles: string[] = []

  const resolutions = await mapWithConcurrency(
    selectedFilenames,
    6,
    async (filename): Promise<[string, ResolvedModEnvironment | null]> => [
      filename,
      await resolveModEnvironment(join(modsDir, filename))
    ]
  )

  for (const [filename, resolved] of resolutions) {
    if (resolved) {
      files.push({
        path: `mods/${filename}`,
        hashes: { sha1: resolved.sha1, sha512: resolved.sha512 },
        // This export only ever runs against a Fabric server's mods/, so
        // every entry is client-required by construction (the caller only
        // passes filenames the user opted into after seeing suggestedInclude)
        // - "required" on the client side, "optional" server-side so the
        // pack still works if a friend imports it as a plain modpack rather
        // than specifically for joining this server.
        env: { client: 'required', server: 'optional' },
        downloads: [resolved.downloadUrl],
        fileSize: resolved.fileSize
      })
    } else {
      // Unrecognized by Modrinth (private/dev mod, or a mod not published
      // there) - bundled directly via overrides/ rather than dropped, since
      // the friend still needs the actual jar to join.
      overrideFiles.push(filename)
    }
  }

  const index = {
    formatVersion: 1,
    game: 'minecraft',
    versionId: `${server.mcVersion}-friends`,
    name: `${server.name} (Freunde-Mods)`,
    files,
    dependencies: {
      minecraft: server.mcVersion,
      ...(server.fabricLoaderVersion ? { 'fabric-loader': server.fabricLoaderVersion } : {})
    }
  }

  const zip = new AdmZip()
  zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(index, null, 2), 'utf-8'))
  for (const filename of overrideFiles) {
    zip.addLocalFile(join(modsDir, filename), 'overrides/mods')
  }
  mkdirSync(dirname(savePath), { recursive: true })
  zip.writeZip(savePath)
}

export async function exportFriendsMods(serverId: string, selectedFilenames: string[]): Promise<string | null> {
  const server = getServer(serverId)
  if (!server) throw new Error('Server nicht gefunden.')

  const result = await dialog.showSaveDialog({
    defaultPath: `${server.name}.mrpack`,
    filters: [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }]
  })
  refocusMainWindow()
  if (result.canceled || !result.filePath) return null

  await buildMrpack(serverId, selectedFilenames, result.filePath)
  return result.filePath
}

export interface ImportModsFromInstanceResult {
  imported: string[]
  skippedClientOnly: string[]
}

// Copies a client instance's mods straight into a Fabric server's mods/ -
// skipping anything Modrinth marks client_only/singleplayer_only (Sodium
// being the canonical example: it does nothing on a dedicated server, and
// some client-only mods actively crash one). A jar Modrinth can't identify
// at all defaults to *importing* it, same "when ambiguous, include"
// philosophy as scanServerMods - a private/dev mod is far more likely to be
// something the server genuinely needs than a client-only mod that happens
// to be unrecognized.
export async function importModsFromInstance(
  serverId: string,
  instanceId: string
): Promise<ImportModsFromInstanceResult> {
  const server = getServer(serverId)
  if (!server) throw new Error('Server nicht gefunden.')

  const sourceModsDir = join(getInstanceRoot(instanceId), 'mods')
  if (!existsSync(sourceModsDir)) return { imported: [], skippedClientOnly: [] }
  const files = readdirSync(sourceModsDir).filter((f) => f.toLowerCase().endsWith('.jar'))

  const destModsDir = join(getServerRoot(serverId), 'mods')
  mkdirSync(destModsDir, { recursive: true })

  const imported: string[] = []
  const skippedClientOnly: string[] = []

  await mapWithConcurrency(files, 6, async (filename) => {
    const resolved = await resolveModEnvironment(join(sourceModsDir, filename))
    if (resolved && !canRunOnServer(resolved.environment)) {
      skippedClientOnly.push(resolved.title)
      return
    }
    copyFileSync(join(sourceModsDir, filename), join(destModsDir, filename))
    imported.push(filename)
  })

  return { imported, skippedClientOnly }
}

export function registerFriendsModsHandlers(): void {
  ipcMain.handle('friendsMods:scan', (_event, serverId: string) => scanServerMods(serverId))
  ipcMain.handle('friendsMods:export', (_event, serverId: string, selectedFilenames: string[]) =>
    exportFriendsMods(serverId, selectedFilenames)
  )
  ipcMain.handle('friendsMods:importFromInstance', (_event, serverId: string, instanceId: string) =>
    importModsFromInstance(serverId, instanceId)
  )
}
