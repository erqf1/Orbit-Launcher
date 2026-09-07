import { ipcMain } from 'electron'
import { listFabricLoaderVersions } from './fabric'
import { listQuiltLoaderVersions } from './quilt'
import type { LoaderVersionSummary } from './fabricLike'

export type LoaderId = 'fabric' | 'quilt'

export function registerLoaderHandlers(): void {
  ipcMain.handle(
    'loaders:list',
    (_event, loader: LoaderId, mcVersion: string): Promise<LoaderVersionSummary[]> => {
      if (loader === 'fabric') return listFabricLoaderVersions(mcVersion)
      if (loader === 'quilt') return listQuiltLoaderVersions(mcVersion)
      throw new Error(`Unbekannter Loader: ${loader}`)
    }
  )
}
