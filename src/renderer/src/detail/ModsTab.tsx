import { useCallback, useEffect, useState } from 'react'
import ModBrowserDialog from './ModBrowserDialog'
import { useLocale } from '../i18n'
import type { CuratedMod, Instance, InstalledMod, ModCheckResult, ModSearchResult, UpdateCandidate } from '../types'

interface Props {
  instance: Instance
}

function ModsTab({ instance }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [installedSearch, setInstalledSearch] = useState('')
  const [showModBrowser, setShowModBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showCurated, setShowCurated] = useState(false)
  const [curated, setCurated] = useState<CuratedMod[]>([])
  const [loadingCurated, setLoadingCurated] = useState(false)
  const [selectedCurated, setSelectedCurated] = useState<Set<string>>(new Set())
  const [installingBatch, setInstallingBatch] = useState(false)

  const [checkResult, setCheckResult] = useState<ModCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [installingChecked, setInstallingChecked] = useState(false)

  const [updates, setUpdates] = useState<Map<string, UpdateCandidate>>(new Map())
  const [checkingUpdates, setCheckingUpdates] = useState(false)
  const [updatingAll, setUpdatingAll] = useState(false)
  const [updatingFilename, setUpdatingFilename] = useState<string | null>(null)

  const refreshInstalled = useCallback(() => {
    window.api.listMods(instance.id).then(setInstalled)
  }, [instance.id])

  useEffect(() => {
    refreshInstalled()
  }, [refreshInstalled])

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

  async function handleRemove(filename: string): Promise<void> {
    await window.api.removeMod(instance.id, filename)
    refreshInstalled()
  }

  async function handleToggle(filename: string): Promise<void> {
    await window.api.toggleModEnabled(instance.id, filename)
    refreshInstalled()
  }

  async function handleCheckUpdates(): Promise<void> {
    setError(null)
    setCheckingUpdates(true)
    try {
      const candidates = await window.api.checkModUpdates(instance.id, instance.mcVersion, instance.loader)
      setUpdates(new Map(candidates.map((c) => [c.filename, c])))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCheckingUpdates(false)
    }
  }

  async function handleUpdateOne(filename: string): Promise<void> {
    const candidate = updates.get(filename)
    if (!candidate) return
    setError(null)
    setUpdatingFilename(filename)
    try {
      await window.api.updateMod(instance.id, filename, candidate.file)
      setUpdates((prev) => {
        const next = new Map(prev)
        next.delete(filename)
        return next
      })
      refreshInstalled()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUpdatingFilename(null)
    }
  }

  // One failing update shouldn't abort the rest of the batch (a stale
  // download URL for a single mod used to stop the whole "update all" run
  // silently, leaving every mod after it in the iteration order untouched) -
  // each is attempted independently and only successes are cleared from the
  // pending list, mirroring PrismImportDialog's per-item failure handling.
  async function handleUpdateAll(): Promise<void> {
    setError(null)
    setUpdatingAll(true)
    const failures: string[] = []
    for (const [filename, candidate] of updates) {
      try {
        await window.api.updateMod(instance.id, filename, candidate.file)
        setUpdates((prev) => {
          const next = new Map(prev)
          next.delete(filename)
          return next
        })
      } catch (err) {
        failures.push(`${candidate.title}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    refreshInstalled()
    setUpdatingAll(false)
    if (failures.length > 0) {
      setError(t('mods.updateAllFailures', { count: failures.length, details: failures.join('\n') }))
    }
  }

  async function handlePickFileToCheck(): Promise<void> {
    setError(null)
    setChecking(true)
    setCheckResult(null)
    try {
      const result = await window.api.pickAndCheckModFile()
      setCheckResult(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setChecking(false)
    }
  }

  async function handleInstallChecked(): Promise<void> {
    if (!checkResult) return
    setInstallingChecked(true)
    try {
      await window.api.installModFromFile(instance.id, checkResult.filePath)
      setCheckResult(null)
      refreshInstalled()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingChecked(false)
    }
  }

  function toggleCuratedSection(): void {
    const next = !showCurated
    setShowCurated(next)
    if (next && curated.length === 0) {
      setLoadingCurated(true)
      setError(null)
      window.api
        .listCuratedMods(instance.mcVersion, instance.loader)
        .then(setCurated)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setLoadingCurated(false))
    }
  }

  function toggleSelected(projectId: string): void {
    setSelectedCurated((prev) => {
      const next = new Set(prev)
      if (next.has(projectId)) next.delete(projectId)
      else next.add(projectId)
      return next
    })
  }

  const selectableCurated = curated.filter(
    (mod) => mod.compatible && !installed.some((m) => m.filename.includes(mod.slug))
  )
  const allCuratedSelected =
    selectableCurated.length > 0 && selectableCurated.every((mod) => selectedCurated.has(mod.projectId))

  function toggleSelectAllCurated(): void {
    setSelectedCurated(
      allCuratedSelected ? new Set() : new Set(selectableCurated.map((mod) => mod.projectId))
    )
  }

  async function handleInstallSelected(): Promise<void> {
    setError(null)
    setInstallingBatch(true)
    try {
      const extraDeps = new Map<string, ModSearchResult>()
      for (const projectId of selectedCurated) {
        const deps = await installOne(projectId)
        for (const dep of deps) {
          if (!selectedCurated.has(dep.projectId)) extraDeps.set(dep.projectId, dep)
        }
      }
      refreshInstalled()
      if (extraDeps.size > 0) {
        const names = [...extraDeps.values()].map((d) => d.title).join(', ')
        if (window.confirm(t('mods.extraDepsConfirm', { names }))) {
          for (const dep of extraDeps.values()) await installOne(dep.projectId)
          refreshInstalled()
        }
      }
      setSelectedCurated(new Set())
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingBatch(false)
    }
  }

  const visibleInstalled = installedSearch.trim()
    ? installed.filter((mod) =>
        (mod.title ?? mod.filename).toLowerCase().includes(installedSearch.trim().toLowerCase())
      )
    : installed

  const curatedByCategory = curated.reduce<Record<string, CuratedMod[]>>((acc, mod) => {
    ;(acc[mod.category] ??= []).push(mod)
    return acc
  }, {})

  return (
    <div className="detail-tab mods-tab">
      <div className="mods-tab-columns">
      <section className="mods-installed-section">
        <div className="mod-section-header">
          <h3>{t('mods.installedHeading', { count: installed.length })}</h3>
          <div className="detail-row-actions">
            {updates.size > 0 && (
              <button type="button" className="save-button" onClick={handleUpdateAll} disabled={updatingAll}>
                {updatingAll ? t('mods.updating') : t('mods.updateAll', { count: updates.size })}
              </button>
            )}
            <button type="button" onClick={handleCheckUpdates} disabled={checkingUpdates || installed.length === 0}>
              {checkingUpdates ? t('mods.checkingUpdates') : t('mods.checkUpdates')}
            </button>
          </div>
        </div>
        {installed.length === 0 ? (
          <p className="instance-meta">{t('mods.empty')}</p>
        ) : (
          <>
            {installed.length > 6 && (
              <input
                className="mod-browser-search-input"
                value={installedSearch}
                onChange={(e) => setInstalledSearch(e.target.value)}
                placeholder={t('mods.searchInstalledPlaceholder')}
              />
            )}
            {visibleInstalled.length === 0 ? (
              <p className="instance-meta">{t('common.noResults')}</p>
            ) : (
              <ul className="mod-list mods-installed-list">
                {visibleInstalled.map((mod) => (
                  <li key={mod.filename} className={mod.enabled ? '' : 'mod-disabled'}>
                    <span className="mod-row">
                      {mod.iconUrl ? (
                        <img className="mod-icon" src={mod.iconUrl} alt="" />
                      ) : (
                        <span className="mod-icon mod-icon-fallback">
                          {(mod.title ?? mod.filename).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="mod-title">{mod.title ?? mod.filename.replace(/\.disabled$/, '')}</span>
                    </span>
                    <span className="mod-row-end">
                      {mod.versionNumber && <span className="pill pill-version">V{mod.versionNumber}</span>}
                      {!mod.enabled && <span className="pill pill-disabled">{t('mods.disabledPill')}</span>}
                      {updates.has(mod.filename) && (
                        <span className="pill pill-update">
                          {t('mods.updatePill', { version: updates.get(mod.filename)!.newVersionNumber })}
                        </span>
                      )}
                      <span className="detail-row-actions">
                        {updates.has(mod.filename) && (
                          <button
                            type="button"
                            className="save-button"
                            onClick={() => handleUpdateOne(mod.filename)}
                            disabled={updatingFilename === mod.filename || updatingAll}
                          >
                            {updatingFilename === mod.filename ? t('mods.updating') : t('mods.updateOne')}
                          </button>
                        )}
                        <button type="button" onClick={() => handleToggle(mod.filename)}>
                          {mod.enabled ? t('mods.disable') : t('mods.enable')}
                        </button>
                        <button type="button" onClick={() => handleRemove(mod.filename)}>
                          {t('mods.remove')}
                        </button>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <section className="mods-add-section">
        <h3>{t('mods.addSectionTitle')}</h3>

        <div className="mods-add-source">
          <button type="button" className="save-button" onClick={() => setShowModBrowser(true)}>
            {t('mods.browseModrinth')}
          </button>
        </div>

        <div className="mods-add-subsection">
          <div className="mod-section-header">
            <h4>{t('mods.recommendedTitle')}</h4>
            <button type="button" onClick={toggleCuratedSection}>
              {showCurated ? t('mods.hide') : t('mods.show')}
            </button>
          </div>

          {showCurated &&
            (loadingCurated ? (
              <p className="instance-meta">{t('mods.loadingRecommended')}</p>
            ) : (
              <>
                <div className="mod-section-header">
                  <p className="instance-meta">{t('mods.availableCount', { count: selectableCurated.length })}</p>
                  <button
                    type="button"
                    onClick={toggleSelectAllCurated}
                    disabled={selectableCurated.length === 0}
                  >
                    {allCuratedSelected ? t('mods.deselectAll') : t('mods.selectAll')}
                  </button>
                </div>
                {Object.entries(curatedByCategory).map(([category, mods]) => (
                  <div key={category} className="curated-category">
                    <h4>{category}</h4>
                    <ul className="mod-list">
                      {mods.map((mod) => (
                        <li key={mod.projectId}>
                          <label className="checkbox-label mod-checkbox">
                            <input
                              type="checkbox"
                              checked={selectedCurated.has(mod.projectId)}
                              disabled={
                                !mod.compatible || installed.some((m) => m.filename.includes(mod.slug))
                              }
                              onChange={() => toggleSelected(mod.projectId)}
                            />
                            <span className="mod-row">
                              {mod.iconUrl ? (
                                <img className="mod-icon" src={mod.iconUrl} alt="" />
                              ) : (
                                <span className="mod-icon mod-icon-fallback">
                                  {mod.title.charAt(0).toUpperCase()}
                                </span>
                              )}
                              <span className="mod-name-block">
                                <span className="mod-title">{mod.title}</span>
                                {!mod.compatible && <span className="pill pill-disabled">{t('mods.incompatiblePill')}</span>}
                                {mod.compatible && installed.some((m) => m.filename.includes(mod.slug)) && (
                                  <span className="pill pill-version">{t('mods.installedPill')}</span>
                                )}
                              </span>
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                <button
                  type="button"
                  className="save-button"
                  onClick={handleInstallSelected}
                  disabled={selectedCurated.size === 0 || installingBatch}
                >
                  {installingBatch ? t('mods.installing') : t('mods.installSelected', { count: selectedCurated.size })}
                </button>
              </>
            ))}
        </div>

        <div className="mods-add-subsection">
          <h4>{t('mods.manualAddTitle')}</h4>
          <p className="instance-meta">{t('mods.manualCheckDescription')}</p>
          <button type="button" onClick={handlePickFileToCheck} disabled={checking}>
            {checking ? t('mods.checking') : t('mods.chooseFile')}
          </button>

          {checkResult && (
            <div className="mod-check-result">
              {checkResult.status === 'verified' && (
                <p className="mod-check-ok">
                  {t('mods.verifiedPrefix')} <strong>{checkResult.matchedProject?.title ?? checkResult.filename}</strong>
                  {checkResult.matchedVersionNumber
                    ? t('mods.verifiedVersionSuffix', { version: checkResult.matchedVersionNumber })
                    : ''}{' '}
                  {t('mods.verifiedSuffix')}
                </p>
              )}
              {checkResult.status === 'nameMismatch' && checkResult.matchedProject && (
                <p className="error">
                  {t('mods.mismatchPrefix')} <strong>{checkResult.matchedProject.title}</strong>
                  {checkResult.matchedVersionNumber
                    ? t('mods.mismatchVersionSuffix', { version: checkResult.matchedVersionNumber })
                    : ''}
                  {checkResult.claimedProject
                    ? t('mods.mismatchClaimedSuffix', { claimedTitle: checkResult.claimedProject.title })
                    : t('mods.mismatchGenericSuffix')}
                </p>
              )}
              {checkResult.status === 'nameMismatch' && !checkResult.matchedProject && (
                <p className="error">
                  {t('mods.claimedMismatchPrefix')} <strong>{checkResult.claimedProject?.title}</strong>{' '}
                  {t('mods.claimedMismatchSuffix')}
                </p>
              )}
              {checkResult.status === 'unrecognized' && <p className="error">{t('mods.unrecognizedWarning')}</p>}
              <div className="modal-actions">
                <button type="button" onClick={() => setCheckResult(null)}>
                  {t('mods.discard')}
                </button>
                <button type="button" onClick={handleInstallChecked} disabled={installingChecked}>
                  {installingChecked
                    ? t('mods.installing')
                    : checkResult.status === 'verified'
                      ? t('mods.install')
                      : t('mods.installAnyway')}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
      </div>

      {error && <p className="error">{error}</p>}

      {showModBrowser && (
        <ModBrowserDialog
          instance={instance}
          installed={installed}
          onClose={() => setShowModBrowser(false)}
          onInstalled={refreshInstalled}
        />
      )}
    </div>
  )
}

export default ModsTab
