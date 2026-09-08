import { ipcMain } from 'electron'
import { getProjectInfo, listModVersions, type ModSearchResult } from './modrinth'

export interface CuratedModEntry {
  slug: string
  category: 'Performance' | 'Komfort' | 'Fixes' | 'Kosmetik'
}

// Slugs verified against the live Modrinth API - these are current,
// actively maintained (as of testing) Fabric/Quilt mods; several of these
// (sodium, lithium, ferrite-core, entityculling) don't have Forge ports, and
// have at most partial/newer-only NeoForge ports. No Forge-specific
// equivalents (Rubidium/Embeddium etc.) are listed separately - the
// `compatible` flag below already reports per-mod, per-loader, per-version
// availability from Modrinth directly rather than assuming it from a static
// list, so a Forge/NeoForge instance browsing this list correctly sees
// what's actually installable instead of a wrong yes/no guess.
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
  { slug: 'capes', category: 'Kosmetik' },
  { slug: 'krypton', category: 'Performance' },
  { slug: 'immediatelyfast', category: 'Performance' },
  { slug: 'dynamic-fps', category: 'Performance' },
  { slug: 'clumps', category: 'Performance' },
  { slug: 'moreculling', category: 'Performance' },
  { slug: 'spark', category: 'Performance' },
  { slug: 'konkrete', category: 'Komfort' },
  { slug: 'chat-heads', category: 'Kosmetik' },
  { slug: 'morechathistory', category: 'Komfort' },
  { slug: 'dcch', category: 'Komfort' },
  { slug: 'better-ping-display-fabric', category: 'Komfort' },
  { slug: 'fast-ip-ping', category: 'Komfort' },
  { slug: 'better-advancements', category: 'Komfort' },
  { slug: 'better-mount-hud', category: 'Komfort' },
  { slug: 'ukus-armor-hud', category: 'Komfort' },
  { slug: 'shulkerboxtooltip', category: 'Komfort' },
  { slug: 'simple-voice-chat', category: 'Komfort' },
  { slug: 'cubes-without-borders', category: 'Kosmetik' },
  { slug: 'armor-trim-item-fix', category: 'Fixes' },
  { slug: 'no-gaps-in-yo-items', category: 'Fixes' }
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
