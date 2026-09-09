import { useEffect, useRef, useState } from 'react'
import SkinViewer3D from './SkinViewer3D'
import SkinPickerDialog from './SkinPickerDialog'
import { useLocale } from './i18n'
import type { AccountCustomization } from './types'

interface Account {
  id: string
  name: string
}

interface Props {
  activeId: string | null
  accounts: Account[]
  onSwitch: (id: string) => void
  onRemove: (id: string) => void
  onAddAccount: () => void
  busy: boolean
  askOnPlay: boolean
  onToggleAskOnPlay: (value: boolean) => void
}

// Crops just the 8x8 face region out of a full skin texture via CSS
// background positioning (scaled up 1:N) rather than pulling in a canvas or
// a skin-rendering library for a small sidebar avatar.
function faceAvatarStyle(skinUrl: string, size: number): React.CSSProperties {
  const scale = size / 8
  return {
    backgroundImage: `url(${skinUrl})`,
    backgroundSize: `${64 * scale}px ${64 * scale}px`,
    backgroundPosition: `-${8 * scale}px -${8 * scale}px`,
    width: size,
    height: size
  }
}

function AccountSwitcher({
  activeId,
  accounts,
  onSwitch,
  onRemove,
  onAddAccount,
  busy,
  askOnPlay,
  onToggleAskOnPlay
}: Props): React.JSX.Element {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [customization, setCustomization] = useState<AccountCustomization | null>(null)
  const [busySkin, setBusySkin] = useState(false)
  const [skinError, setSkinError] = useState<string | null>(null)
  const [showSkinPicker, setShowSkinPicker] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  // Falls back to the first saved account rather than showing a bare "…"
  // placeholder - activeId briefly not matching any account can happen for
  // a tick right after switching/removing, and there's no reason to ever
  // show "logged in as nothing" when accounts actually exist.
  const activeAccount = accounts.find((a) => a.id === activeId) ?? accounts[0] ?? null

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    let cancelled = false
    setCustomization(null)
    if (!activeAccount) return
    window.api.getAccountCustomization(activeAccount.id).then((result) => {
      if (cancelled) return
      setCustomization(result)
    })
    return () => {
      cancelled = true
    }
  }, [activeAccount?.id])

  async function handleSetCape(capeId: string | null): Promise<void> {
    if (!activeAccount) return
    setSkinError(null)
    setBusySkin(true)
    try {
      const result = await window.api.setActiveCape(activeAccount.id, capeId)
      setCustomization(result)
    } catch (err) {
      setSkinError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusySkin(false)
    }
  }

  return (
    <div className="account-switcher" ref={ref}>
      <button type="button" className="account-trigger" onClick={() => setOpen((o) => !o)} disabled={busy}>
        {customization?.skinUrl && (
          <span className="account-face-avatar" style={faceAvatarStyle(customization.skinUrl, 20)} />
        )}
        <span className="account">
          {t('app.loggedInAs')} <strong>{activeAccount?.name ?? '…'}</strong>
        </span>
      </button>
      {open && (
        <div className="account-panel">
          {accounts.map((account) => (
            <div key={account.id} className="account-panel-row">
              <button
                type="button"
                className={`account-panel-item${account.id === activeId ? ' active' : ''}`}
                onClick={() => {
                  setOpen(false)
                  if (account.id !== activeId) onSwitch(account.id)
                }}
              >
                {account.id === activeId ? '● ' : ''}
                {account.name}
              </button>
              <button
                type="button"
                className="account-panel-remove"
                title={t('account.removeAccount')}
                onClick={() => onRemove(account.id)}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="account-panel-add"
            onClick={() => {
              setOpen(false)
              onAddAccount()
            }}
          >
            {t('account.addAccount')}
          </button>
          {accounts.length > 1 && (
            <label className="account-panel-ask-toggle">
              <input
                type="checkbox"
                checked={askOnPlay}
                onChange={(e) => onToggleAskOnPlay(e.target.checked)}
              />
              {t('account.askBeforePlay')}
            </label>
          )}

          {activeAccount && (
            <div className="account-customization">
              <div className="account-customization-title">{t('account.skinAndCape')}</div>

              <div className="skin-preview-row">
                <SkinViewer3D
                  skinUrl={customization?.skinUrl ?? null}
                  variant={customization?.variant ?? 'CLASSIC'}
                  capeUrl={customization?.capes.find((c) => c.active)?.url ?? null}
                  width={90}
                  height={180}
                />
                <div className="skin-preview-controls">
                  <button
                    type="button"
                    className="save-button"
                    onClick={() => setShowSkinPicker(true)}
                    disabled={busySkin}
                  >
                    {t('account.changeSkin')}
                  </button>

                  <div className="cape-list">
                    <button
                      type="button"
                      className={`cape-list-item${!customization?.capes.some((c) => c.active) ? ' active' : ''}`}
                      onClick={() => handleSetCape(null)}
                      disabled={busySkin}
                    >
                      <span className="cape-option cape-option-none">✕</span>
                      {t('account.noCape')}
                    </button>
                    {customization?.capes.map((cape) => (
                      <button
                        key={cape.id}
                        type="button"
                        className={`cape-list-item${cape.active ? ' active' : ''}`}
                        onClick={() => handleSetCape(cape.id)}
                        disabled={busySkin}
                      >
                        <span className="cape-option">
                          <img src={cape.url} alt="" />
                        </span>
                        {cape.alias}
                      </button>
                    ))}
                  </div>
                  {customization && customization.capes.length === 0 && (
                    <p className="instance-meta">{t('account.noCapes')}</p>
                  )}
                </div>
              </div>

              {skinError && <p className="error">{skinError}</p>}
            </div>
          )}
        </div>
      )}

      {showSkinPicker && activeAccount && (
        <SkinPickerDialog
          accountId={activeAccount.id}
          customization={customization}
          onApplied={setCustomization}
          onClose={() => setShowSkinPicker(false)}
        />
      )}
    </div>
  )
}

export default AccountSwitcher
