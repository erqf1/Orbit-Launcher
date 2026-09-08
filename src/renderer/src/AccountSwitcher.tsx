import { useEffect, useRef, useState } from 'react'
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

// A skin texture's front-facing regions (u, v, w, h in texture pixels, for
// the standard 64x64 layout) - the "paper doll" below stacks these into a
// flat front silhouette the same way Prism's skin picker preview does,
// without needing a 3D renderer. Arm width differs by model: 4px (classic)
// vs 3px (slim), same u/v origin either way.
const DOLL_REGIONS = {
  head: { u: 8, v: 8, w: 8, h: 8 },
  body: { u: 20, v: 20, w: 8, h: 12 },
  armRight: { u: 44, v: 20, h: 12 },
  armLeft: { u: 36, v: 52, h: 12 },
  legRight: { u: 4, v: 20, w: 4, h: 12 },
  legLeft: { u: 20, v: 52, w: 4, h: 12 }
}

function regionStyle(
  skinUrl: string,
  scale: number,
  region: { u: number; v: number; w: number; h: number },
  left: number,
  top: number
): React.CSSProperties {
  return {
    position: 'absolute',
    left: left * scale,
    top: top * scale,
    width: region.w * scale,
    height: region.h * scale,
    backgroundImage: `url(${skinUrl})`,
    backgroundSize: `${64 * scale}px ${64 * scale}px`,
    backgroundPosition: `-${region.u * scale}px -${region.v * scale}px`
  }
}

interface SkinDollProps {
  skinUrl: string
  variant: 'CLASSIC' | 'SLIM'
  scale: number
}

// Front-view paper doll: head centered on top, arms flanking the body,
// legs side by side underneath - assembled purely from CSS-positioned
// texture crops of the regions above.
function SkinDoll({ skinUrl, variant, scale }: SkinDollProps): React.JSX.Element {
  const armWidth = variant === 'SLIM' ? 3 : 4
  const armRight = { ...DOLL_REGIONS.armRight, w: armWidth }
  const armLeft = { ...DOLL_REGIONS.armLeft, w: armWidth }
  const width = 8 + armWidth * 2
  const bodyLeft = armWidth

  return (
    <div className="skin-doll" style={{ width: width * scale, height: 32 * scale }}>
      <div style={regionStyle(skinUrl, scale, DOLL_REGIONS.head, bodyLeft, 0)} />
      <div style={regionStyle(skinUrl, scale, DOLL_REGIONS.body, bodyLeft, 8)} />
      <div style={regionStyle(skinUrl, scale, armLeft, 0, 8)} />
      <div style={regionStyle(skinUrl, scale, armRight, bodyLeft + 8, 8)} />
      <div style={regionStyle(skinUrl, scale, DOLL_REGIONS.legLeft, bodyLeft, 20)} />
      <div style={regionStyle(skinUrl, scale, DOLL_REGIONS.legRight, bodyLeft + 4, 20)} />
    </div>
  )
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
                {customization?.skinUrl ? (
                  <SkinDoll skinUrl={customization.skinUrl} variant={pendingVariant} scale={5} />
                ) : (
                  <div className="skin-doll placeholder" style={{ width: 70, height: 160 }} />
                )}
                <div className="skin-preview-controls">
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
                  <button type="button" className="save-button" onClick={handleChangeSkin} disabled={busySkin}>
                    {busySkin ? '…' : t('account.changeSkin')}
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
    </div>
  )
}

export default AccountSwitcher
