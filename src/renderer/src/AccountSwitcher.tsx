import { useEffect, useRef, useState } from 'react'
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
  const [open, setOpen] = useState(false)
  const [customization, setCustomization] = useState<AccountCustomization | null>(null)
  const [pendingVariant, setPendingVariant] = useState<'CLASSIC' | 'SLIM'>('CLASSIC')
  const [busySkin, setBusySkin] = useState(false)
  const [skinError, setSkinError] = useState<string | null>(null)
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
      if (result) setPendingVariant(result.variant)
    })
    return () => {
      cancelled = true
    }
  }, [activeAccount?.id])

  async function handleChangeSkin(): Promise<void> {
    if (!activeAccount) return
    setSkinError(null)
    setBusySkin(true)
    try {
      const result = await window.api.changeSkin(activeAccount.id, pendingVariant)
      setCustomization(result)
    } catch (err) {
      setSkinError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusySkin(false)
    }
  }

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
          Angemeldet als <strong>{activeAccount?.name ?? '…'}</strong>
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
                title="Konto entfernen"
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
            + Weiteres Konto hinzufügen
          </button>
          {accounts.length > 1 && (
            <label className="account-panel-ask-toggle">
              <input
                type="checkbox"
                checked={askOnPlay}
                onChange={(e) => onToggleAskOnPlay(e.target.checked)}
              />
              Vor jedem Start fragen, welches Konto
            </label>
          )}

          {activeAccount && (
            <div className="account-customization">
              <div className="account-customization-title">Skin & Umhang</div>

              <div className="skin-preview-row">
                {customization?.skinUrl ? (
                  <span className="account-face-avatar large" style={faceAvatarStyle(customization.skinUrl, 40)} />
                ) : (
                  <span className="account-face-avatar large placeholder" />
                )}
                <div className="skin-variant-toggle">
                  <button
                    type="button"
                    className={pendingVariant === 'CLASSIC' ? 'active' : ''}
                    onClick={() => setPendingVariant('CLASSIC')}
                  >
                    Classic
                  </button>
                  <button
                    type="button"
                    className={pendingVariant === 'SLIM' ? 'active' : ''}
                    onClick={() => setPendingVariant('SLIM')}
                  >
                    Slim
                  </button>
                </div>
              </div>
              <button type="button" className="save-button" onClick={handleChangeSkin} disabled={busySkin}>
                {busySkin ? '…' : 'Skin ändern…'}
              </button>

              <div className="cape-row">
                <button
                  type="button"
                  className={`cape-option${!customization?.capes.some((c) => c.active) ? ' active' : ''}`}
                  onClick={() => handleSetCape(null)}
                  disabled={busySkin}
                  title="Kein Umhang"
                >
                  ✕
                </button>
                {customization?.capes.map((cape) => (
                  <button
                    key={cape.id}
                    type="button"
                    className={`cape-option${cape.active ? ' active' : ''}`}
                    onClick={() => handleSetCape(cape.id)}
                    disabled={busySkin}
                    title={cape.alias}
                  >
                    <img src={cape.url} alt={cape.alias} />
                  </button>
                ))}
              </div>
              {customization && customization.capes.length === 0 && (
                <p className="instance-meta">Keine offiziellen Umhänge für dieses Konto.</p>
              )}

              {skinError && <p className="error">{skinError}</p>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default AccountSwitcher
