import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { Instance, InstalledMod, ModSearchResult, ModVersionSummary } from '../types'

interface Props {
  instance: Instance
  installed: InstalledMod[]
  onClose: () => void
  onInstalled: () => void
}

// Its own modal (rather than the cramped inline section in ModsTab) so there's
// room to browse properly, and searches live as you type instead of waiting
// for Enter - debounced so fast typing doesn't fire a request per keystroke.
function ModBrowserDialog({ instance, installed, onClose, onInstalled }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Version picker state - "Install" no longer immediately installs the
  // top-ranked version; it opens an inline picker (defaulting to that same
  // top match) so the user can choose an older/different build instead.
  const [versionPickerId, setVersionPickerId] = useState<string | null>(null)
  const [pickerVersions, setPickerVersions] = useState<ModVersionSummary[]>([])
  const [pickerSelectedId, setPickerSelectedId] = useState('')
  const [loadingVersions, setLoadingVersions] = useState(false)

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

  async function installVersion(projectId: string, version: ModVersionSummary): Promise<ModSearchResult[]> {
    await window.api.installMod(instance.id, { url: version.url, filename: version.filename })
    if (version.requiredDependencyProjectIds.length === 0) return []
    return window.api.getModDependencies(projectId, instance.mcVersion, instance.loader)
  }

  // Dependencies are always auto-installed at their own newest matching
  // version - the version picker is for the mod the user explicitly chose
  // to install, not for every dependency it drags in.
  async function installBest(projectId: string): Promise<ModSearchResult[]> {
    const versions = await window.api.listModVersions(projectId, instance.mcVersion, instance.loader)
    const best = versions[0]
    if (!best) throw new Error(t('mods.noMatchingVersion'))
    return installVersion(projectId, best)
  }

  async function openVersionPicker(projectId: string): Promise<void> {
    setError(null)
    setVersionPickerId(projectId)
    setLoadingVersions(true)
    setPickerVersions([])
    setPickerSelectedId('')
    try {
      const versions = await window.api.listModVersions(projectId, instance.mcVersion, instance.loader)
      setPickerVersions(versions)
      setPickerSelectedId(versions[0]?.id ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setVersionPickerId(null)
    } finally {
      setLoadingVersions(false)
    }
  }

  function closeVersionPicker(): void {
    setVersionPickerId(null)
    setPickerVersions([])
  }

  async function handleInstall(projectId: string): Promise<void> {
    const version = pickerVersions.find((v) => v.id === pickerSelectedId)
    if (!version) return
    setError(null)
    setInstallingId(projectId)
    try {
      const deps = await installVersion(projectId, version)
      onInstalled()
      if (deps.length > 0) {
        const names = deps.map((d) => d.title).join(', ')
        if (window.confirm(t('mods.dependenciesConfirm', { names }))) {
          for (const dep of deps) await installBest(dep.projectId)
          onInstalled()
        }
      }
      closeVersionPicker()
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
          {results.map((hit) => {
            // Matched by filename substring rather than a stored project id
            // (installed mod files don't carry Modrinth metadata on disk) -
            // same heuristic ModsTab already uses for the curated-mods list,
            // since a Modrinth-downloaded jar's filename reliably embeds the
            // project slug.
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
                {versionPickerId === hit.projectId ? (
                  <span className="mod-version-picker">
                    {loadingVersions ? (
                      <span className="instance-meta">{t('mods.searching')}</span>
                    ) : pickerVersions.length === 0 ? (
                      <span className="instance-meta">{t('mods.noMatchingVersion')}</span>
                    ) : (
                      <select value={pickerSelectedId} onChange={(e) => setPickerSelectedId(e.target.value)}>
                        {pickerVersions.map((v) => (
                          <option key={v.id} value={v.id}>
                            {v.versionNumber}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="button"
                      onClick={() => handleInstall(hit.projectId)}
                      disabled={!pickerSelectedId || installingId === hit.projectId}
                    >
                      {installingId === hit.projectId ? t('mods.installing') : t('mods.install')}
                    </button>
                    <button type="button" onClick={closeVersionPicker}>
                      {t('common.cancel')}
                    </button>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => openVersionPicker(hit.projectId)}
                    disabled={alreadyInstalled}
                  >
                    {alreadyInstalled ? t('mods.installedPill') : t('mods.install')}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </div>
  )
}

export default ModBrowserDialog
