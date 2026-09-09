import { useEffect, useState } from 'react'
import { useLocale } from './i18n'
import type { ZipFormat } from './types'

interface Props {
  onCancel: () => void
  onImported: () => void
}

const CURSEFORGE_KEY_URL = 'https://console.curseforge.com/?#/api-keys'

// Both real modpack zip formats (Modrinth .mrpack and CurseForge's export)
// are auto-detected from the archive's own contents - see
// zipImport.ts:detectZipFormat - rather than asking the user which one it
// is; a CurseForge key is only ever asked for once a CurseForge pack is
// actually picked, not upfront, since most people importing a .mrpack never
// need one at all.
function ZipImportDialog({ onCancel, onImported }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [zipPath, setZipPath] = useState<string | null>(null)
  const [format, setFormat] = useState<ZipFormat | null>(null)
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [savingKey, setSavingKey] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])

  useEffect(() => {
    window.api.getCurseForgeApiKey().then(setApiKey)
  }, [])

  async function handleBrowse(): Promise<void> {
    const chosen = await window.api.browseZipFile()
    if (!chosen) return
    setZipPath(chosen)
    setError(null)
    setWarnings([])
    try {
      setFormat(await window.api.detectZipFormat(chosen))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setFormat(null)
    }
  }

  async function handleSaveKey(): Promise<void> {
    const trimmed = apiKeyInput.trim()
    if (!trimmed) return
    setSavingKey(true)
    try {
      await window.api.setCurseForgeApiKey(trimmed)
      setApiKey(trimmed)
      setApiKeyInput('')
    } finally {
      setSavingKey(false)
    }
  }

  async function handleImport(): Promise<void> {
    if (!zipPath) return
    setError(null)
    setWarnings([])
    setImporting(true)
    try {
      const result = await window.api.importZip(zipPath)
      if (result.failures.length > 0) setWarnings(result.failures)
      onImported()
      if (result.failures.length === 0) onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  const needsCurseForgeKey = format === 'curseforge' && !apiKey
  const canImport = !importing && !!zipPath && format !== null && format !== 'unknown' && !needsCurseForgeKey

  function formatLabel(): string | null {
    if (format === 'mrpack') return t('zipImport.formatMrpack')
    if (format === 'curseforge') return t('zipImport.formatCurseforge')
    if (format === 'unknown') return t('zipImport.formatUnknown')
    return null
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('zipImport.title')}</h2>
        <p className="instance-meta">{t('zipImport.description')}</p>

        <button type="button" onClick={handleBrowse}>
          {t('zipImport.chooseFile')}
        </button>
        {zipPath && <p className="instance-meta">{t('importDialog.folderLabel', { path: zipPath })}</p>}
        {formatLabel() && <p className="instance-meta">{formatLabel()}</p>}

        {needsCurseForgeKey && (
          <section className="settings-section">
            <h4 className="settings-section-title">{t('zipImport.curseforgeKeyTitle')}</h4>
            <p className="instance-meta">{t('zipImport.curseforgeKeyExplainer')}</p>
            <button type="button" onClick={() => window.api.openExternalUrl(CURSEFORGE_KEY_URL)}>
              {t('zipImport.curseforgeKeyGetKey')}
            </button>
            <div className="field-row">
              <input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                placeholder={t('zipImport.curseforgeKeyPlaceholder')}
              />
              <button type="button" onClick={handleSaveKey} disabled={!apiKeyInput.trim() || savingKey}>
                {t('common.save')}
              </button>
            </div>
          </section>
        )}

        {error && <p className="error">{error}</p>}
        {warnings.length > 0 && (
          <p className="error">{t('zipImport.partialFailure', { count: warnings.length, details: warnings.join('\n') })}</p>
        )}

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

export default ZipImportDialog
