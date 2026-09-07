import { useEffect, useRef, useState } from 'react'

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

function OverflowMenu({ items, disabled }: Props): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className="overflow-menu" ref={ref}>
      <button
        type="button"
        className="overflow-trigger"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-label="Weitere Aktionen"
      >
        ⋯
      </button>
      {open && (
        <div className="overflow-panel">
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
        </div>
      )}
    </div>
  )
}

export default OverflowMenu
