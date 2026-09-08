import { useCallback, useEffect, useState } from 'react'
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
  const [files, setFiles] = useState<ContentFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lightboxName, setLightboxName] = useState<string | null>(null)
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null)
  const [zoomed, setZoomed] = useState(false)
  const [copied, setCopied] = useState(false)

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
    setCopied(false)
    const url = await window.api.getContentFileDataUrl(instanceId, 'screenshots', name)
    setLightboxUrl(url)
  }

  async function handleRemove(name: string): Promise<void> {
    if (!window.confirm(`"${name}" wirklich löschen?`)) return
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
          Ordner öffnen
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">Lade…</p>
      ) : files.length === 0 ? (
        <p className="instance-meta">Keine Screenshots vorhanden.</p>
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
          >
            {lightboxUrl ? (
              <img
                src={lightboxUrl}
                alt={lightboxName}
                className={zoomed ? 'zoomed' : ''}
                onClick={() => setZoomed((z) => !z)}
                title={zoomed ? 'Klicken zum Verkleinern' : 'Klicken zum Vergrößern'}
              />
            ) : (
              <p className="instance-meta">Lade…</p>
            )}
            <div className="screenshot-lightbox-actions">
              <span className="screenshot-lightbox-name" title={lightboxName}>
                {lightboxName}
              </span>
              <button type="button" onClick={handleCopy}>
                {copied ? 'Kopiert!' : 'Kopieren'}
              </button>
              <button type="button" onClick={() => handleRemove(lightboxName)}>
                Löschen
              </button>
              <button type="button" onClick={() => setLightboxName(null)}>
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ScreenshotsTab
