import { useEffect, useRef, useState } from 'react'
import type { Instance, ModSearchResult } from '../types'

interface Props {
  instance: Instance
  onClose: () => void
  onInstalled: () => void
}

// Its own modal (rather than the cramped inline section in ModsTab) so there's
// room to browse properly, and searches live as you type instead of waiting
// for Enter - debounced so fast typing doesn't fire a request per keystroke.
function ModBrowserDialog({ instance, onClose, onInstalled }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setSearching(false)
      return
    }
    setSearching(true)
    debounceRef.current = setTimeout(() => {
      window.api
        .searchMods(trimmed, instance.mcVersion, instance.loader)
        .then((hits) => {
          setResults(hits)
          setError(null)
        })
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSearching(false))
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, instance.mcVersion, instance.loader])

  async function installOne(projectId: string): Promise<ModSearchResult[]> {
    const versions = await window.api.listModVersions(projectId, instance.mcVersion, instance.loader)
    const best = versions[0]
    if (!best) {
      throw new Error('Keine passende Version für diese Minecraft-Version/diesen Loader gefunden.')
    }
    await window.api.installMod(instance.id, { url: best.url, filename: best.filename })
    if (best.requiredDependencyProjectIds.length === 0) return []
    return window.api.getModDependencies(projectId, instance.mcVersion, instance.loader)
  }

  async function handleInstall(projectId: string): Promise<void> {
    setError(null)
    setInstallingId(projectId)
    try {
      const deps = await installOne(projectId)
      onInstalled()
      if (deps.length > 0) {
        const names = deps.map((d) => d.title).join(', ')
        if (window.confirm(`Benötigt außerdem: ${names}. Jetzt mitinstallieren?`)) {
          for (const dep of deps) await installOne(dep.projectId)
          onInstalled()
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingId(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal mod-browser-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mod-browser-header">
          <h2>Modrinth durchsuchen</h2>
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>

        <input
          className="mod-browser-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Mod-Name eingeben…"
          autoFocus
        />

        {error && <p className="error">{error}</p>}

        <ul className="mod-list mod-browser-results">
          {!query.trim() && <li className="mod-browser-hint">Tipp einfach los, es wird live gesucht.</li>}
          {query.trim() && searching && results.length === 0 && (
            <li className="mod-browser-hint">Suche…</li>
          )}
          {query.trim() && !searching && results.length === 0 && (
            <li className="mod-browser-hint">Keine Treffer.</li>
          )}
          {results.map((hit) => (
            <li key={hit.projectId}>
              <span className="mod-row">
                {hit.iconUrl ? (
                  <img className="mod-icon" src={hit.iconUrl} alt="" />
                ) : (
                  <span className="mod-icon mod-icon-fallback">{hit.title.charAt(0).toUpperCase()}</span>
                )}
                <span className="mod-name-block">
                  <span className="mod-title">{hit.title}</span>
                </span>
              </span>
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
      </div>
    </div>
  )
}

export default ModBrowserDialog
