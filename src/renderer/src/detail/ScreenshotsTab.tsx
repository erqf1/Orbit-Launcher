import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { ContentFileEntry } from '../types'

interface Props {
  instanceId: string
}

function ScreenshotThumb({
  instanceId,
  file,
  onOpen
}: {
  instanceId: string
  file: ContentFileEntry
  onOpen: () => void
}): React.JSX.Element {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.getContentFileDataUrl(instanceId, 'screenshots', file.name).then((u) => {
      if (!cancelled) setUrl(u)
    })
    return () => {
      cancelled = true
    }
  }, [instanceId, file.name])

  return (
    <button type="button" className="screenshot-thumb" onClick={onOpen} title={file.name}>
      {url ? <img src={url} alt={file.name} /> : <span className="screenshot-thumb-loading">…</span>}
    </button>
  )
}

// Screenshots come from the game itself (F2), so unlike resource/shader
// packs there's no "add" affordance here - just browse, enlarge, copy, delete.
function ScreenshotsTab({ instanceId }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [files, setFiles] = useState<ContentFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [zoomOrigin, setZoomOrigin] = useState({ x: 50, y: 50 })
  const [copied, setCopied] = useState(false)
  const lightboxRef = useRef<HTMLDivElement>(null)
  // Drag-to-pan while zoomed - tracked outside React state since it updates
  // on every mousemove pixel and only ever drives a direct DOM scroll
  // assignment, not a re-render.
  const dragRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null)
  // Set on mouseup only if the drag actually moved - read (and cleared) by
  // the click handler that fires right after, so releasing a drag doesn't
  // also toggle zoom the way a plain click would.
  const draggedRef = useRef(false)

  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listContentFiles(instanceId, 'screenshots')
      .then(setFiles)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [instanceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function openLightbox(name: string): Promise<void> {
    setLightboxName(name)
    setLightboxUrl(null)
    setZoomed(false)
    setZoomOrigin({ x: 50, y: 50 })
    setCopied(false)
    const url = await window.api.getContentFileDataUrl(instanceId, 'screenshots', name)
    setLightboxUrl(url)
  }

  // Anchors both the zoom-in AND the zoom-out to wherever was clicked (as a
  // % of the image's own rendered box), not just scaling from/to the
  // center - updating the origin on every click (not only the zoom-in one)
  // means shrinking back down also happens toward the spot you clicked,
  // instead of the shrink always snapping to whatever point you originally
  // zoomed in at.
  function handleImageClick(e: React.MouseEvent<HTMLImageElement>): void {
    if (draggedRef.current) {
      // Just finished a drag-pan release, which also fires a click - don't
      // additionally toggle zoom from that same gesture.
      draggedRef.current = false
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    setZoomOrigin({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100
    })
    setZoomed((z) => !z)
  }

  // Click-and-drag panning while zoomed, implemented as scrolling the
  // already-scrollable lightbox container (see .screenshot-lightbox.zoomed's
  // overflow:auto) rather than a separate transform-translate, so there's
  // only ever one source of truth for "where in the enlarged image is the
  // viewport looking".
  function handleImageMouseDown(e: React.MouseEvent<HTMLImageElement>): void {
    if (!zoomed || !lightboxRef.current) return
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      scrollLeft: lightboxRef.current.scrollLeft,
      scrollTop: lightboxRef.current.scrollTop
    }
  }

  useEffect(() => {
    function handleMouseMove(e: MouseEvent): void {
      const drag = dragRef.current
      const container = lightboxRef.current
      if (!drag || !container) return
      const dx = e.clientX - drag.startX
      const dy = e.clientY - drag.startY
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) draggedRef.current = true
      container.scrollLeft = drag.scrollLeft - dx
      container.scrollTop = drag.scrollTop - dy
    }
    function handleMouseUp(): void {
      dragRef.current = null
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  async function handleRemove(name: string): Promise<void> {
    if (!window.confirm(t('content.confirmDelete', { name }))) return
    await window.api.removeContentFile(instanceId, 'screenshots', name)
    if (lightboxName === name) setLightboxName(null)
    refresh()
  }

  async function handleCopy(): Promise<void> {
    if (!lightboxName) return
    await window.api.copyContentFileToClipboard(instanceId, 'screenshots', lightboxName)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleOpenFolder(): Promise<void> {
    await window.api.openContentFolder(instanceId, 'screenshots')
  }

  return (
    <div className="detail-tab">
      <div className="detail-tab-header">
        <button type="button" onClick={handleOpenFolder}>
          {t('common.openFolder')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : files.length === 0 ? (
        <p className="instance-meta">{t('screenshots.empty')}</p>
      ) : (
        <div className="screenshot-grid">
          {files.map((f) => (
            <ScreenshotThumb key={f.name} instanceId={instanceId} file={f} onOpen={() => openLightbox(f.name)} />
          ))}
        </div>
      )}

      {lightboxName && (
        <div className="modal-backdrop" onClick={() => setLightboxName(null)}>
          <div
            className={`screenshot-lightbox${zoomed ? ' zoomed' : ''}`}
            onClick={(e) => e.stopPropagation()}
            ref={lightboxRef}
          >
            {lightboxUrl ? (
              <img
                src={lightboxUrl}
                alt={lightboxName}
                className={zoomed ? 'zoomed' : ''}
                style={{ transformOrigin: `${zoomOrigin.x}% ${zoomOrigin.y}%` }}
                draggable={false}
                onClick={handleImageClick}
                onMouseDown={handleImageMouseDown}
                title={zoomed ? t('screenshots.clickToShrink') : t('screenshots.clickToEnlarge')}
              />
            ) : (
              <p className="instance-meta">{t('common.loading')}</p>
            )}
            <div className="screenshot-lightbox-actions">
              <span className="screenshot-lightbox-name" title={lightboxName}>
                {lightboxName}
              </span>
              <button type="button" onClick={handleCopy}>
                {copied ? t('common.copied') : t('common.copy')}
              </button>
              <button type="button" onClick={() => handleRemove(lightboxName)}>
                {t('common.delete')}
              </button>
              <button type="button" onClick={() => setLightboxName(null)}>
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScreenshotsTab
