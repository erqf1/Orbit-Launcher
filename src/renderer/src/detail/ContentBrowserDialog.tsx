import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { Instance, ModSearchResult } from '../types'

interface Props {
  instance: Instance
  subfolder: 'resourcepacks' | 'shaderpacks'
  projectType: 'resourcepack' | 'shader'
  title: string
  onClose: () => void
  onInstalled: () => void
}

// Same live/debounced-search-with-icons shape as ModBrowserDialog, but for
// resource packs and shader packs - both are ordinary Modrinth project
// types, version-scoped rather than loader-scoped, and installing one is
// just a direct file download (no dependency resolution like mods have).
function ContentBrowserDialog({
  instance,
  subfolder,
  projectType,
  title,
  onClose,
  onInstalled
}: Props): React.JSX.Element {
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
    debounceRef.current = setTimeout(() => {
      window.api
        .searchContent(trimmed, projectType, instance.mcVersion)
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
  }, [query, projectType, instance.mcVersion])

  async function handleInstall(projectId: string): Promise<void> {
    setError(null)
    setInstallingId(projectId)
    try {
      const file = await window.api.getBestContentVersion(projectId, instance.mcVersion)
      if (!file) throw new Error(t('content.noMatchingVersion'))
      await window.api.installContentFileFromUrl(instance.id, subfolder, file)
      onInstalled()
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
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <input
          className="mod-browser-search-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('content.searchPlaceholder')}
          autoFocus
        />

        {error && <p className="error">{error}</p>}

        <p className="mod-browser-results-label">{query.trim() ? t('content.searchResultsLabel') : t('content.topPicksLabel')}</p>

        <ul className="mod-list mod-browser-results">
          {searching && results.length === 0 && <li className="mod-browser-hint">{t('content.searching')}</li>}
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
                {installingId === hit.projectId ? t('content.installing') : t('content.install')}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

export default ContentBrowserDialog
