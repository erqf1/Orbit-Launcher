import { useRef } from 'react'

// A modal-backdrop's onClick alone is unreliable: browsers can fire a click
// on the backdrop even when the interaction actually started inside the
// modal - e.g. selecting text, or dragging through a <select>'s option
// list, and releasing the mouse button past the modal's edge. That closed
// the dialog even though the user never intended to dismiss it, just to
// select something. Only treat it as a real "click outside" when the
// mousedown that started this interaction was ALSO on the backdrop itself,
// not just wherever the click's target happens to land.
export function useBackdropClose(onClose: () => void): {
  onMouseDown: (e: React.MouseEvent) => void
  onClick: (e: React.MouseEvent) => void
} {
  const downOnBackdrop = useRef(false)
  return {
    onMouseDown: (e) => {
      downOnBackdrop.current = e.target === e.currentTarget
    },
    onClick: (e) => {
      if (downOnBackdrop.current && e.target === e.currentTarget) onClose()
    }
  }
}
