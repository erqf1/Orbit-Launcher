import { useEffect, useState } from 'react'
import PrismImportDialog from './PrismImportDialog'
import OfficialImportDialog from './OfficialImportDialog'
import ManualFolderImportDialog from './ManualFolderImportDialog'
import { useLocale } from './i18n'
import type { LauncherOption } from './types'
import { useBackdropClose } from './useBackdropClose'

interface Props {
  onCancel: () => void
  onImported: () => void
}

// First step of importing: pick which launcher to import from. Only
// launchers actually detected on disk are offered as primary options (per
// request - no point showing sixteen buttons when only two are relevant to
// this machine); "Andere" always stays available as a manual-folder
// fallback - that fallback used to hand off to PrismImportDialog itself
// (assuming Prism's own on-disk format even for a folder that isn't a Prism
// instance at all), now it's ManualFolderImportDialog, which doesn't assume
// any particular launcher's format. Detected-but-not-yet-supported
// launchers (their on-disk format isn't parsed by this app yet) still show
// up, so it's at least honest about "yes, that's installed here" - clicking
// one says so instead of pretending to import.
function ImportPickerDialog({ onCancel, onImported }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [launchers, setLaunchers] = useState<LauncherOption[] | null>(null)
  const [selected, setSelected] = useState<'prism' | 'official' | 'manual' | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    window.api.detectLaunchers().then(setLaunchers)
  }, [])

  if (selected === 'prism') return <PrismImportDialog onCancel={onCancel} onImported={onImported} />
  if (selected === 'official') return <OfficialImportDialog onCancel={onCancel} onImported={onImported} />
  if (selected === 'manual') return <ManualFolderImportDialog onCancel={onCancel} onImported={onImported} />

  function handlePick(option: LauncherOption): void {
    if (!option.supported) {
      setNotice(t('importPicker.notSupportedNotice', { label: option.label }))
      return
    }
    setNotice(null)
    setSelected(option.id as 'prism' | 'official')
  }

  const detected = launchers?.filter((l) => l.detected) ?? []

  return (
    <div className="modal-backdrop" {...useBackdropClose(onCancel)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('importPicker.title')}</h2>
        <p className="instance-meta">{t('importPicker.subtitle')}</p>

        {launchers === null ? (
          <p className="instance-meta">{t('importPicker.searching')}</p>
        ) : detected.length === 0 ? (
          <p className="instance-meta">{t('importPicker.noneFound')}</p>
        ) : (
          <div className="launcher-picker-grid">
            {detected.map((option) => (
              <button
                key={option.id}
                type="button"
                className="launcher-picker-item"
                onClick={() => handlePick(option)}
              >
                {option.label}
                {!option.supported && <span className="pill pill-disabled">{t('importPicker.comingSoon')}</span>}
              </button>
            ))}
          </div>
        )}

        {notice && <p className="error">{notice}</p>}

        <p className="settings-section-title">{t('importPicker.otherSectionTitle')}</p>
        <button type="button" onClick={() => setSelected('manual')}>
          {t('importPicker.chooseFolderManually')}
        </button>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ImportPickerDialog
