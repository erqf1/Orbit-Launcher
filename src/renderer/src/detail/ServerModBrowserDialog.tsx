import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { FriendsModEntry, ModSearchResult, ServerInstance } from '../types'

interface Props {
  server: ServerInstance
  installed: FriendsModEntry[]
  onClose: () => void
  onInstalled: () => void
}

// Forked from PluginBrowserDialog, not ModBrowserDialog - a server's own
// mods/ folder (not a client instance's) is the install target, and the
// search itself is pre-filtered server-side (see modrinth.ts's
// searchServerMods: a server_side:required/optional facet) so a client-only
// mod like Sodium never even shows up here to begin with, rather than
// showing up and then failing/doing nothing once installed.
function ServerModBrowserDialog({ server, installed, onClose, onInstalled }: Props): React.JSX.Element {
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
        .searchServerMods(trimmed, server.mcVersion)
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
  }, [query, server.mcVersion])

  async function handleInstall(projectId: string): Promise<void> {
    setError(null)
    setInstallingId(projectId)
    try {
      const versions = await window.api.listServerModVersions(projectId, server.mcVersion)
      const best = versions[0]
      if (!best) throw new Error(t('mods.noMatchingVersion'))
      await window.api.installServerMod(server.id, { url: best.url, filename: best.filename })
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
          <h2>{t('serverHost.serverMods.browseDialogTitle')}</h2>
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
          {results.map((hit) => {
            const alreadyInstalled = installed.some((m) => m.filename.includes(hit.slug))
            return (
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
                  disabled={alreadyInstalled || installingId === hit.projectId}
                >
                  {alreadyInstalled
                    ? t('mods.installedPill')
                    : installingId === hit.projectId
                      ? t('mods.installing')
                      : t('mods.install')}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default ServerModBrowserDialog
