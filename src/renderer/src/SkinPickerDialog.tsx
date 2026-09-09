import { useEffect, useState } from 'react'
import SkinViewer3D from './SkinViewer3D'
import { useLocale } from './i18n'
import type { AccountCustomization, LookedUpSkin, SkinHistoryEntry } from './types'

// Crops just the 8x8 face region out of a full skin texture via CSS
// background positioning - same technique AccountSwitcher's own sidebar
// avatar uses, duplicated here rather than imported to avoid a circular
// import between the two dialog/panel components.
function faceThumbStyle(skinUrl: string): React.CSSProperties {
  const scale = 48 / 8
  return {
    backgroundImage: `url(${skinUrl})`,
    backgroundSize: `${64 * scale}px ${64 * scale}px`,
    backgroundPosition: `-${8 * scale}px -${8 * scale}px`
  }
}

interface Props {
  accountId: string
  customization: AccountCustomization | null
  onApplied: (result: AccountCustomization | null) => void
  onClose: () => void
}

interface Staged {
  skinUrl: string
  variant: 'CLASSIC' | 'SLIM'
  previewCapeUrl: string | null
  label: string
}

// Prism-style skin picker: upload a file (unchanged, still a native file
// dialog since that's the only way to actually get a new PNG's bytes into
// this app), re-apply something from this account's local history (Mojang
// itself doesn't track skin history beyond the single ACTIVE one - see
// skinHistory.ts), or pull a skin straight off any player's public profile
// by username. The last two never touch the filesystem at all - both are
// just a textures.minecraft.net URL handed to Mojang's set-skin-by-url
// endpoint (changeSkinByUrl), so "staging" one just means holding that
// URL+variant here until Apply is pressed.
function SkinPickerDialog({ accountId, customization, onApplied, onClose }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [history, setHistory] = useState<SkinHistoryEntry[]>([])
  const [staged, setStaged] = useState<Staged | null>(null)
  const [username, setUsername] = useState('')
  const [searching, setSearching] = useState(false)
  const [applying, setApplying] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.listSkinHistory(accountId).then(setHistory)
  }, [accountId])

  async function handleUploadFile(): Promise<void> {
    setError(null)
    setUploading(true)
    try {
      const result = await window.api.changeSkin(accountId, staged?.variant ?? customization?.variant ?? 'CLASSIC')
      onApplied(result)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
    }
  }

  async function handleSearchUsername(): Promise<void> {
    const trimmed = username.trim()
    if (!trimmed) return
    setError(null)
    setSearching(true)
    try {
      const result: LookedUpSkin = await window.api.lookupSkinByUsername(trimmed)
      setStaged({
        skinUrl: result.skinUrl,
        variant: result.variant,
        previewCapeUrl: result.capeUrl,
        label: t('skinPicker.stagedFromUsername', { name: result.username })
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  function handlePickHistory(entry: SkinHistoryEntry): void {
    setError(null)
    setStaged({
      skinUrl: entry.skinUrl,
      variant: entry.variant,
      previewCapeUrl: null,
      label: t('skinPicker.stagedFromHistory')
    })
  }

  async function handleRemoveHistory(entryId: string): Promise<void> {
    const next = await window.api.removeSkinHistoryEntry(accountId, entryId)
    setHistory(next)
  }

  async function handleApplyStaged(): Promise<void> {
    if (!staged) return
    setError(null)
    setApplying(true)
    try {
      const result = await window.api.changeSkinByUrl(accountId, staged.skinUrl, staged.variant)
      onApplied(result)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  const previewSkinUrl = staged?.skinUrl ?? customization?.skinUrl ?? null
  const previewVariant = staged?.variant ?? customization?.variant ?? 'CLASSIC'
  const previewCapeUrl = staged
    ? staged.previewCapeUrl
    : customization?.capes.find((c) => c.active)?.url ?? null

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>{t('skinPicker.title')}</h2>

        <div className="skin-picker-layout">
          <div className="skin-picker-preview">
            <SkinViewer3D skinUrl={previewSkinUrl} variant={previewVariant} capeUrl={previewCapeUrl} />
            {staged && (
              <>
                <p className="instance-meta">{staged.label}</p>
                {staged.previewCapeUrl && <p className="instance-meta">{t('skinPicker.capeNotApplied')}</p>}
                <div className="modal-actions">
                  <button type="button" onClick={() => setStaged(null)}>
                    {t('common.cancel')}
                  </button>
                  <button type="button" className="save-button" onClick={handleApplyStaged} disabled={applying}>
                    {applying ? t('skinPicker.applying') : t('skinPicker.apply')}
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="skin-picker-sections">
            <section className="settings-section">
              <h4 className="settings-section-title">{t('skinPicker.fromFileTitle')}</h4>
              <button type="button" onClick={handleUploadFile} disabled={uploading}>
                {uploading ? t('skinPicker.uploading') : t('skinPicker.fromFileButton')}
              </button>
            </section>

            <section className="settings-section">
              <h4 className="settings-section-title">{t('skinPicker.fromUsernameTitle')}</h4>
              <div className="field-row">
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t('skinPicker.usernamePlaceholder')}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearchUsername()}
                />
                <button type="button" onClick={handleSearchUsername} disabled={!username.trim() || searching}>
                  {searching ? t('skinPicker.searching') : t('skinPicker.search')}
                </button>
              </div>
            </section>

            <section className="settings-section">
              <h4 className="settings-section-title">{t('skinPicker.historyTitle')}</h4>
              {history.length === 0 ? (
                <p className="instance-meta">{t('skinPicker.historyEmpty')}</p>
              ) : (
                <ul className="skin-history-list">
                  {history.map((entry) => (
                    <li key={entry.id} className="skin-history-item">
                      <button
                        type="button"
                        className="skin-history-thumb"
                        style={faceThumbStyle(entry.skinUrl)}
                        onClick={() => handlePickHistory(entry)}
                      />
                      <button
                        type="button"
                        className="skin-history-remove"
                        title={t('common.delete')}
                        onClick={() => handleRemoveHistory(entry.id)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default SkinPickerDialog
