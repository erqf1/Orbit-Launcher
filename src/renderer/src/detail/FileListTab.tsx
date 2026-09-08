import { useCallback, useEffect, useState } from 'react'
import ContentBrowserDialog from './ContentBrowserDialog'
import type { ContentFileEntry, Instance } from '../types'

interface BrowseConfig {
  instance: Instance
  subfolder: 'resourcepacks' | 'shaderpacks'
  projectType: 'resourcepack' | 'shader'
  title: string
}

interface Props {
  instanceId: string
  subfolder: string
  addLabel: string
  emptyLabel: string
  browse?: BrowseConfig
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileListTab({ instanceId, subfolder, addLabel, emptyLabel, browse }: Props): React.JSX.Element {
  const [files, setFiles] = useState<ContentFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listContentFiles(instanceId, subfolder)
      .then(setFiles)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [instanceId, subfolder])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleAdd(): Promise<void> {
    setError(null)
    try {
      await window.api.addContentFiles(instanceId, subfolder)
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(name: string): Promise<void> {
    if (!window.confirm(`"${name}" wirklich löschen?`)) return
    await window.api.removeContentFile(instanceId, subfolder, name)
    refresh()
  }

  function startRename(name: string): void {
    setRenamingName(name)
    setRenameDraft(name)
  }

  async function confirmRename(): Promise<void> {
    if (renamingName && renameDraft.trim() && renameDraft.trim() !== renamingName) {
      await window.api.renameContentFile(instanceId, subfolder, renamingName, renameDraft.trim())
      refresh()
    }
    setRenamingName(null)
  }

  async function handleOpenFolder(): Promise<void> {
    await window.api.openContentFolder(instanceId, subfolder)
  }

  return (
    <div className="detail-tab">
      <div className="detail-tab-header">
        {browse && (
          <button type="button" className="save-button" onClick={() => setShowBrowser(true)}>
            Modrinth durchsuchen…
          </button>
        )}
        <button type="button" onClick={handleAdd}>
          {addLabel}
        </button>
        <button type="button" onClick={handleOpenFolder}>
          Ordner öffnen
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">Lade…</p>
      ) : files.length === 0 ? (
        <p className="instance-meta">{emptyLabel}</p>
      ) : (
        <ul className="mod-list">
          {files.map((f) => (
            <li key={f.name}>
              {renamingName === f.name ? (
                <input
                  className="rename-input"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={confirmRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename()
                    if (e.key === 'Escape') setRenamingName(null)
                  }}
                />
              ) : (
                <span title={f.name}>
                  {f.name} · {formatSize(f.size)}
                </span>
              )}
              <span className="detail-row-actions">
                <button type="button" onClick={() => startRename(f.name)}>
                  Umbenennen
                </button>
                <button type="button" onClick={() => handleRemove(f.name)}>
                  Löschen
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {browse && showBrowser && (
        <ContentBrowserDialog
          instance={browse.instance}
          subfolder={browse.subfolder}
          projectType={browse.projectType}
          title={browse.title}
          onClose={() => setShowBrowser(false)}
          onInstalled={refresh}
        />
      )}
    </div>
  )
}

export default FileListTab
