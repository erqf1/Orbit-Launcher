import { ipcMain } from 'electron'
import { listFabricLoaderVersions } from './fabric'
import { listQuiltLoaderVersions } from './quilt'
import { listLegacyFabricLoaderVersions } from './legacyfabric'
import { listForgeLoaderVersions } from './forge'
import { listNeoForgeLoaderVersions } from './neoforge'
import type { LoaderVersionSummary } from './fabricLike'

export type LoaderId = 'fabric' | 'quilt' | 'legacyfabric' | 'forge' | 'neoforge'

export function registerLoaderHandlers(): void {
  ipcMain.handle(
    'loaders:list',
    (_event, loader: LoaderId, mcVersion: string): Promise<LoaderVersionSummary[]> => {
      if (loader === 'fabric') return listFabricLoaderVersions(mcVersion)
      if (loader === 'quilt') return listQuiltLoaderVersions(mcVersion)
      if (loader === 'legacyfabric') return listLegacyFabricLoaderVersions(mcVersion)
      if (loader === 'forge') return listForgeLoaderVersions(mcVersion)
      if (loader === 'neoforge') return listNeoForgeLoaderVersions(mcVersion)
      throw new Error(`Unbekannter Loader: ${loader}`)
    }
  )
}
