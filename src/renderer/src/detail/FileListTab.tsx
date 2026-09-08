import { useCallback, useEffect, useState } from 'react'
import ContentBrowserDialog from './ContentBrowserDialog'
import type { EnrichedContentFile, Instance } from '../types'

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

function FileListTab({ instanceId, subfolder, addLabel, emptyLabel, browse }: Props): React.JSX.Element {
  const [files, setFiles] = useState<EnrichedContentFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renamingName, setRenamingName] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [showBrowser, setShowBrowser] = useState(false)

  // Resource/shader packs are ordinary Modrinth project types now that
  // browsing them is wired up, so the same icon/title/version enrichment
  // installed mods get applies here too - identified by hash, same as mods.
  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listContentFilesEnriched(instanceId, subfolder)
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
    <div className="detail-tab mods-tab">
      <div className="mods-tab-columns">
        <section className="mods-installed-section">
          <h3>
            {files.length} {files.length === 1 ? 'Datei' : 'Dateien'}
          </h3>

          {error && <p className="error">{error}</p>}

          {loading ? (
            <p className="instance-meta">Lade…</p>
          ) : files.length === 0 ? (
            <p className="instance-meta">{emptyLabel}</p>
          ) : (
            <ul className="mod-list mods-installed-list">
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
                    <span className="mod-row" title={f.name}>
                      {f.iconUrl ? (
                        <img className="mod-icon" src={f.iconUrl} alt="" />
                      ) : (
                        <span className="mod-icon mod-icon-fallback">
                          {(f.title ?? f.name).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="mod-name-block">
                        <span className="mod-title">{f.title ?? f.name}</span>
                        {f.versionNumber && <span className="pill pill-version">V{f.versionNumber}</span>}
                      </span>
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
        </section>

        <section className="mods-add-section">
          <h3>Hinzufügen</h3>
          {browse && (
            <div className="mods-add-source">
              <button type="button" className="save-button" onClick={() => setShowBrowser(true)}>
                Modrinth durchsuchen…
              </button>
            </div>
          )}
          <div className="mods-add-subsection">
            <button type="button" onClick={handleAdd}>
              {addLabel}
            </button>
            <button type="button" onClick={handleOpenFolder}>
              Ordner öffnen
            </button>
          </div>
        </section>
      </div>

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
