import { useEffect, useRef, useState } from 'react'

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

  return (
    <div className="account-switcher" ref={ref}>
      <button type="button" className="account-trigger" onClick={() => setOpen((o) => !o)} disabled={busy}>
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
        </div>
      )}
    </div>
  )
}

export default AccountSwitcher
