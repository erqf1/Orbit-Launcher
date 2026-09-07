import { ipcMain } from 'electron'
import { getProjectInfo, listModVersions, type ModSearchResult } from './modrinth'

export interface CuratedModEntry {
  slug: string
  category: 'Performance' | 'Komfort' | 'Fixes' | 'Kosmetik'
}

// Slugs verified against the live Modrinth API - these are current,
// actively maintained (as of testing) Fabric/Quilt mods. Forge/NeoForge
// aren't covered here since this app doesn't create Forge/NeoForge
// instances yet; several of these (sodium, lithium, ferrite-core,
// entityculling) don't even support plain Forge upstream.
export const CURATED_MODS: CuratedModEntry[] = [
  { slug: 'fabric-api', category: 'Komfort' },
  { slug: 'sodium', category: 'Performance' },
  { slug: 'lithium', category: 'Performance' },
  { slug: 'lazydfu', category: 'Performance' },
  { slug: 'ferrite-core', category: 'Performance' },
  { slug: 'entityculling', category: 'Performance' },
  { slug: 'modmenu', category: 'Komfort' },
  { slug: 'cloth-config', category: 'Komfort' },
  { slug: 'zoomify', category: 'Komfort' },
  { slug: 'appleskin', category: 'Komfort' },
  { slug: 'no-realms-button', category: 'Komfort' },
  { slug: 'complete-shield-fixes', category: 'Fixes' },
  { slug: 'capes', category: 'Kosmetik' }
]

export interface CuratedMod extends ModSearchResult {
  category: string
  compatible: boolean
}

// Resolves the static slug list into full project info, checking each
// against the instance's actual mcVersion/loader so incompatible entries
// (e.g. a mod that hasn't updated to a brand-new MC version yet) show as
// such instead of silently failing on install.
export async function listCuratedMods(mcVersion: string, loader: string): Promise<CuratedMod[]> {
  const results = await Promise.all(
    CURATED_MODS.map(async (entry): Promise<CuratedMod | null> => {
      try {
        const [info, versions] = await Promise.all([
          getProjectInfo(entry.slug),
          listModVersions(entry.slug, mcVersion, loader)
        ])
        return { ...info, category: entry.category, compatible: versions.length > 0 }
      } catch {
        return null
      }
    })
  )
  return results.filter((r): r is CuratedMod => r !== null)
}

export function registerCuratedModHandlers(): void {
  ipcMain.handle('mods:curated', (_event, mcVersion: string, loader: string) =>
    listCuratedMods(mcVersion, loader)
  )
}
