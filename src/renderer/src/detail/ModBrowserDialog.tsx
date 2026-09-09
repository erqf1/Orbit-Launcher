import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
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
  const { t } = useLocale()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    const trimmed = query.trim()
    setSearching(true)
    // An empty query still searches (searchMods sorts by downloads in that
    // case) so the dialog opens showing top mods instead of a blank list -
    // still debounced so it doesn't double-fire while the dialog mounts.
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
      throw new Error(t('mods.noMatchingVersion'))
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
        if (window.confirm(t('mods.dependenciesConfirm', { names }))) {
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
          <h2>{t('mods.browseDialogTitle')}</h2>
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <input
          className="mod-browser-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('mods.searchPlaceholder')}
          autoFocus
        />

        {error && <p className="error">{error}</p>}

        <p className="mod-browser-results-label">{query.trim() ? t('mods.searchResultsLabel') : t('mods.topModsLabel')}</p>

        <ul className="mod-list mod-browser-results">
          {searching && results.length === 0 && <li className="mod-browser-hint">{t('mods.searching')}</li>}
          {!searching && results.length === 0 && <li className="mod-browser-hint">{t('common.noResults')}</li>}
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
                {installingId === hit.projectId ? t('mods.installing') : t('mods.install')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default ModBrowserDialog
