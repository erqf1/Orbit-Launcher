import { useState } from 'react'
import VersionLoaderFields from './VersionLoaderFields'
import { useLocale } from './i18n'
import type { LoaderType } from './types'
import { useBackdropClose } from './useBackdropClose'

interface Props {
  onCancel: () => void
  onImported: () => void
}

function suggestName(folderPath: string): string {
  const parts = folderPath.split(/[\\/]/).filter(Boolean)
  return parts.at(-1) ?? folderPath
}

// The previous "choose folder manually" option handed the picked folder
// straight to PrismImportDialog, which only understands Prism's own
// instance.cfg/mmc-pack.json layout - pointing it at anything else just
// silently found no instances. This is the actual "point at any folder
// yourself" import: no launcher-specific metadata required, the user names
// the version/loader themselves via the same fields CreateInstanceDialog
// uses, and whatever mods/saves/config/etc. exist in that folder (or its
// nested minecraft/.minecraft subfolder, if it turns out to be a
// Prism/MultiMC-style instance folder) gets copied across.
function ManualFolderImportDialog({ onCancel, onImported }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [folderPath, setFolderPath] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [mcVersion, setMcVersion] = useState('')
  const [loader, setLoader] = useState<LoaderType>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  async function handleBrowse(): Promise<void> {
    const chosen = await window.api.browseGenericImportFolder()
    if (chosen) {
      setFolderPath(chosen)
      if (!name.trim()) setName(suggestName(chosen))
    }
  }

  async function handleImport(): Promise<void> {
    if (!folderPath || !name.trim() || !mcVersion) return
    if (loader !== 'vanilla' && !loaderVersion) return
    setError(null)
    setImporting(true)
    try {
      await window.api.importGenericFolder(
        folderPath,
        name.trim(),
        mcVersion,
        loader,
        loader === 'vanilla' ? undefined : loaderVersion
      )
      onImported()
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  const canImport = !importing && !!folderPath && !!name.trim() && !!mcVersion && (loader === 'vanilla' || !!loaderVersion)

  return (
    <div className="modal-backdrop" {...useBackdropClose(onCancel)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('manualImport.title')}</h2>
        <p className="instance-meta">{t('manualImport.description')}</p>

        <button type="button" onClick={handleBrowse}>
          {t('importDialog.chooseOtherFolder')}
        </button>
        {folderPath && <p className="instance-meta">{t('importDialog.folderLabel', { path: folderPath })}</p>}

        {folderPath && (
          <>
            <label>
              {t('createInstance.name')}
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>

            <VersionLoaderFields
              mcVersion={mcVersion}
              onMcVersionChange={setMcVersion}
              loader={loader}
              onLoaderChange={setLoader}
              loaderVersion={loaderVersion}
              onLoaderVersionChange={setLoaderVersion}
              onError={setError}
            />
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="save-button" onClick={handleImport} disabled={!canImport}>
            {importing ? t('importDialog.importing') : t('importDialog.import')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ManualFolderImportDialog
