import { useEffect, useState } from 'react'
import { useLocale } from './i18n'

interface Props {
  onCancel: () => void
  onImported: () => void
}

// Unlike Prism, the official launcher has no separate "instances" to pick
// from - just one shared .minecraft folder - so this is a single
// confirm-and-go action instead of a list with checkboxes.
function OfficialImportDialog({ onCancel, onImported }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [root, setRoot] = useState<string | null | undefined>(undefined)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.detectOfficialRoot().then(setRoot)
  }, [])

  async function handleBrowse(): Promise<void> {
    const chosen = await window.api.browseOfficialFolder()
    if (chosen) setRoot(chosen)
  }

  async function handleImport(): Promise<void> {
    setError(null)
    setImporting(true)
    try {
      await window.api.importOfficialMinecraft(root ?? undefined)
      onImported()
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('officialImport.title')}</h2>
        <p className="instance-meta">{t('officialImport.description')}</p>

        <button type="button" onClick={handleBrowse}>
          {t('importDialog.chooseOtherFolder')}
        </button>

        {root === undefined ? (
          <p className="instance-meta">{t('officialImport.searchingRoot')}</p>
        ) : root === null ? (
          <p className="instance-meta">{t('officialImport.noRootFound')}</p>
        ) : (
          <p className="instance-meta">{t('importDialog.folderLabel', { path: root })}</p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="save-button" onClick={handleImport} disabled={!root || importing}>
            {importing ? t('importDialog.importing') : t('importDialog.import')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OfficialImportDialog
