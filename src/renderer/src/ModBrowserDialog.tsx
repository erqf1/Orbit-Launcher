import { useCallback, useEffect, useState } from 'react'
import type { Instance, ModSearchResult } from './types'

interface Props {
  instance: Instance
  onClose: () => void
}

function ModBrowserDialog({ instance, onClose }: Props): React.JSX.Element {
  const [installed, setInstalled] = useState<string[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refreshInstalled = useCallback(() => {
    window.api.listMods(instance.id).then(setInstalled)
  }, [instance.id])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

  async function handleSearch(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const hits = await window.api.searchMods(query, instance.mcVersion, instance.loader)
      setResults(hits)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSearching(false)
    }
  }

  async function handleInstall(projectId: string): Promise<void> {
    setError(null)
    setInstallingId(projectId)
    try {
      const versions = await window.api.listModVersions(projectId, instance.mcVersion, instance.loader)
      if (versions.length === 0) {
        throw new Error('Keine passende Version für diese Minecraft-Version/diesen Loader gefunden.')
      }
      const [best] = versions
      await window.api.installMod(instance.id, { url: best.url, filename: best.filename })
      refreshInstalled()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingId(null)
    }
  }

  async function handleRemove(filename: string): Promise<void> {
    await window.api.removeMod(instance.id, filename)
    refreshInstalled()
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal mod-browser" onClick={(e) => e.stopPropagation()}>
        <h2>Mods: {instance.name}</h2>

        <section>
          <h3>Installiert</h3>
          {installed.length === 0 ? (
            <p className="instance-meta">Keine Mods installiert.</p>
          ) : (
            <ul className="mod-list">
              {installed.map((filename) => (
                <li key={filename}>
                  <span>{filename}</span>
                  <button type="button" onClick={() => handleRemove(filename)}>
                    Entfernen
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3>Modrinth durchsuchen</h3>
          <form className="mod-search" onSubmit={handleSearch}>
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mod-Name…" />
            <button type="submit" disabled={searching || !query.trim()}>
              {searching ? 'Suche…' : 'Suchen'}
            </button>
          </form>

          {error && <p className="error">{error}</p>}

          <ul className="mod-list">
            {results.map((hit) => (
              <li key={hit.projectId}>
                <span>{hit.title}</span>
                <button
                  type="button"
                  onClick={() => handleInstall(hit.projectId)}
                  disabled={installingId === hit.projectId}
                >
                  {installingId === hit.projectId ? 'Installiere…' : 'Installieren'}
                </button>
              </li>
            ))}
          </ul>
        </section>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
      </div>
    </div>
  )
}

export default ModBrowserDialog
