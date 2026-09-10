import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocale } from './i18n'

interface MenuItem {
  label: string
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}

interface Props {
  items: MenuItem[]
  disabled?: boolean
}

// The panel renders through a portal into document.body instead of as a
// normal child - instance cards need `transform` on :hover for the lift
// effect, and *any* transformed ancestor creates a new CSS stacking context
// that traps a descendant's z-index inside it, so a later sibling card
// (painted after, same stacking level) could still cover this menu no
// matter how high its own z-index went. Portaling to body sidesteps that
// entirely; position is computed from the trigger button's own rect.
function OverflowMenu({ items, disabled }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState({ top: 0, right: 0 })
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  function toggleOpen(): void {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect()
      setCoords({ top: rect.bottom + 4, right: window.innerWidth - rect.right })
    }
    setOpen((o) => !o)
  }

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  return (
    <div className="overflow-menu">
      <button
        ref={triggerRef}
        type="button"
        className="overflow-trigger"
        onClick={toggleOpen}
        disabled={disabled}
        aria-label={t('overflow.moreActions')}
      >
        ⋯
      </button>
      {open &&
        createPortal(
          <div
            className="overflow-panel"
            ref={panelRef}
            style={{ position: 'fixed', top: coords.top, right: coords.right }}
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                className={item.danger ? 'overflow-item danger' : 'overflow-item'}
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onClick()
                }}
              >
                {item.label}
              </button>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}

export default OverflowMenu
