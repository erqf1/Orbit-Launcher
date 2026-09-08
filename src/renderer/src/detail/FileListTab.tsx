import { useCallback, useEffect, useState } from 'react'
import ContentBrowserDialog from './ContentBrowserDialog'
import type { EnrichedContentFile, Instance, UpdateCandidate } from '../types'

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
  const [updates, setUpdates] = useState<Map<string, UpdateCandidate>>(new Map())
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updatingAll, setUpdatingAll] = useState(false)
  const [updatingName, setUpdatingName] = useState<string | null>(null)

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

  async function handleCheckUpdates(): Promise<void> {
    if (!browse) return
    setError(null)
    setCheckingUpdates(true)
    try {
      const candidates = await window.api.checkContentUpdates(instanceId, subfolder, browse.instance.mcVersion)
      setUpdates(new Map(candidates.map((c) => [c.filename, c])))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCheckingUpdates(false)
    }
  }

  async function handleUpdateOne(name: string): Promise<void> {
    const candidate = updates.get(name)
    if (!candidate) return
    setError(null)
    setUpdatingName(name)
    try {
      await window.api.updateContentFile(instanceId, subfolder, name, candidate.file)
      setUpdates((prev) => {
        const next = new Map(prev)
        next.delete(name)
        return next
      })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingName(null)
    }
  }

  async function handleUpdateAll(): Promise<void> {
    setError(null)
    setUpdatingAll(true)
    try {
      for (const [name, candidate] of updates) {
        await window.api.updateContentFile(instanceId, subfolder, name, candidate.file)
      }
      setUpdates(new Map())
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingAll(false)
    }
  }

  return (
    <div className="detail-tab mods-tab">
      <div className="mods-tab-columns">
        <section className="mods-installed-section">
          <div className="mod-section-header">
            <h3>
              {files.length} {files.length === 1 ? 'Datei' : 'Dateien'}
            </h3>
            {browse && (
              <div className="detail-row-actions">
                {updates.size > 0 && (
                  <button type="button" className="save-button" onClick={handleUpdateAll} disabled={updatingAll}>
                    {updatingAll ? 'Aktualisiere…' : `Alle aktualisieren (${updates.size})`}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleCheckUpdates}
                  disabled={checkingUpdates || files.length === 0}
                >
                  {checkingUpdates ? 'Suche…' : 'Nach Updates suchen'}
                </button>
              </div>
            )}
          </div>

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
                        {updates.has(f.name) && (
                          <span className="pill pill-update">Update: V{updates.get(f.name)!.newVersionNumber}</span>
                        )}
                      </span>
                    </span>
                  )}
                  <span className="detail-row-actions">
                    {updates.has(f.name) && (
                      <button
                        type="button"
                        className="save-button"
                        onClick={() => handleUpdateOne(f.name)}
                        disabled={updatingName === f.name || updatingAll}
                      >
                        {updatingName === f.name ? 'Aktualisiere…' : 'Aktualisieren'}
                      </button>
                    )}
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
