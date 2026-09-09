import { ipcMain, dialog } from 'electron'
import { existsSync, mkdirSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import AdmZip from 'adm-zip'
import { getServerRoot, getServer } from './serverManager'
import {
  resolveModEnvironment,
  mapWithConcurrency,
  assertSafeFilename,
  type ResolvedModEnvironment
} from '../mods/modrinth'
import { refocusMainWindow } from '../windowFocus'

export interface FriendsModEntry {
  filename: string
  title: string
  environment: string
  // false for a jar Modrinth couldn't identify at all by hash - still
  // included in the export (bundled directly, see buildMrpack), just
  // without Modrinth-hosted download metadata.
  resolved: boolean
  // The default checkbox state buildMrpack's caller should show pre-ticked
  // - true unless the environment string unambiguously says server-only.
  suggestedInclude: boolean
}

const SERVER_ONLY_ENVIRONMENTS = new Set(['server_only'])

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
      return { filename, title: filename, environment: 'unknown', resolved: false, suggestedInclude: true }
    }
    return {
      filename,
      title: resolved.title,
      environment: resolved.environment,
      resolved: true,
      suggestedInclude: !SERVER_ONLY_ENVIRONMENTS.has(resolved.environment)
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

export function registerFriendsModsHandlers(): void {
  ipcMain.handle('friendsMods:scan', (_event, serverId: string) => scanServerMods(serverId))
  ipcMain.handle('friendsMods:export', (_event, serverId: string, selectedFilenames: string[]) =>
    exportFriendsMods(serverId, selectedFilenames)
  )
}
