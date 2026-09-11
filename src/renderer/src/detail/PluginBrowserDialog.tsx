import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { InstalledPlugin, ModDependency, ModSearchResult, ServerInstance } from '../types'
import { useBackdropClose } from '../useBackdropClose'

interface Props {
  server: ServerInstance
  installed: InstalledPlugin[]
  onClose: () => void
  onInstalled: () => void
}

// Forked from ModBrowserDialog (not the more minimal ContentBrowserDialog) -
// plugins, like mods, can have Modrinth dependencies[] worth resolving
// before install, which resource/shader packs never have.
function PluginBrowserDialog({ server, installed, onClose, onInstalled }: Props): React.JSX.Element {
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
        .searchPlugins(trimmed, server.mcVersion)
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

  // Plugins are searched/versioned with loader 'vanilla' (see
  // listPluginVersions in modrinth.ts - Modrinth doesn't loader-scope
  // plugins the way it does mods), so dependency resolution reuses the same
  // 'vanilla' loader value for consistency with what was actually installed.
  async function installOne(projectId: string): Promise<ModDependency[]> {
    const versions = await window.api.listPluginVersions(projectId, server.mcVersion)
    const best = versions[0]
    if (!best) throw new Error(t('mods.noMatchingVersion'))
    await window.api.installPlugin(server.id, { url: best.url, filename: best.filename })
    if (best.requiredDependencies.length === 0) return []
    return window.api.getModDependencies(projectId, server.mcVersion, 'vanilla', {
      versionId: best.id,
      serverId: server.id
    })
  }

  // Mirrors ModBrowserDialog's installDependency - installs (or, if an
  // incompatible version of the same project is already on disk, replaces)
  // exactly the version Modrinth resolved for this dependency, instead of
  // adding a second, potentially mismatched copy alongside an existing one.
  async function installDependency(dep: ModDependency): Promise<void> {
    if (dep.installed && dep.installed.versionId === dep.versionId) return
    if (dep.installed) {
      await window.api.removePlugin(server.id, dep.installed.filename)
    }
    await window.api.installPlugin(server.id, dep.file)
  }

  async function handleInstall(projectId: string): Promise<void> {
    setError(null)
    setInstallingId(projectId)
    try {
      const deps = await installOne(projectId)
      onInstalled()
      const pending = deps.filter((dep) => !dep.installed || dep.installed.versionId !== dep.versionId)
      if (pending.length > 0) {
        const names = pending.map((d) => d.title).join(', ')
        if (window.confirm(t('mods.dependenciesConfirm', { names }))) {
          for (const dep of pending) await installDependency(dep)
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
    <div className="modal-backdrop" {...useBackdropClose(onClose)}>
      <div className="modal mod-browser-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="mod-browser-header">
          <h2>{t('serverHost.plugins.browseDialogTitle')}</h2>
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

export default PluginBrowserDialog
