import { useCallback, useEffect, useState } from 'react'
import ModBrowserDialog from './ModBrowserDialog'
import type { CuratedMod, Instance, InstalledMod, ModCheckResult, ModSearchResult } from '../types'

interface Props {
  instance: Instance
  allInstances: Instance[]
}

function ModsTab({ instance, allInstances }: Props): React.JSX.Element {
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [showModBrowser, setShowModBrowser] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [showCurated, setShowCurated] = useState(false)
  const [curated, setCurated] = useState<CuratedMod[]>([])
  const [loadingCurated, setLoadingCurated] = useState(false)
  const [selectedCurated, setSelectedCurated] = useState<Set<string>>(new Set())
  const [installingBatch, setInstallingBatch] = useState(false)

  const [selectedInstalled, setSelectedInstalled] = useState<Set<string>>(new Set())
  const [copyTargetId, setCopyTargetId] = useState('')
  const [copying, setCopying] = useState(false)

  const [checkResult, setCheckResult] = useState<ModCheckResult | null>(null)
  const [checking, setChecking] = useState(false)
  const [installingChecked, setInstallingChecked] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

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
      throw new Error('Keine passende Version für diese Minecraft-Version/diesen Loader gefunden.')
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
        if (window.confirm(`Zusätzlich benötigt: ${names}. Jetzt mitinstallieren?`)) {
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

  function toggleInstalledSelected(filename: string): void {
    setSelectedInstalled((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  const copyTargets = allInstances.filter(
    (i) => i.id !== instance.id && i.loader === instance.loader && i.mcVersion === instance.mcVersion
  )

  async function handleCopyMods(): Promise<void> {
    if (!copyTargetId || selectedInstalled.size === 0) return
    setError(null)
    setCopyMessage(null)
    setCopying(true)
    try {
      const targetName = copyTargets.find((i) => i.id === copyTargetId)?.name ?? copyTargetId
      const count = selectedInstalled.size
      await window.api.copyMods(instance.id, copyTargetId, [...selectedInstalled])
      setSelectedInstalled(new Set())
      setCopyMessage(`${count} Mod(s) nach „${targetName}“ kopiert.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCopying(false)
    }
  }

  const curatedByCategory = curated.reduce<Record<string, CuratedMod[]>>((acc, mod) => {
    ;(acc[mod.category] ??= []).push(mod)
    return acc
  }, {})

  return (
    <div className="detail-tab mods-tab">
      <section className="mods-installed-section">
        <h3>Installiert ({installed.length})</h3>
        {installed.length === 0 ? (
          <p className="instance-meta">Keine Mods installiert.</p>
        ) : (
          <>
            <ul className="mod-list mods-installed-list">
              {installed.map((mod) => (
                <li key={mod.filename} className={mod.enabled ? '' : 'mod-disabled'}>
                  <label className="checkbox-label mod-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedInstalled.has(mod.filename)}
                      onChange={() => toggleInstalledSelected(mod.filename)}
                    />
                    <span className="mod-row">
                      {mod.iconUrl ? (
                        <img className="mod-icon" src={mod.iconUrl} alt="" />
                      ) : (
                        <span className="mod-icon mod-icon-fallback">
                          {(mod.title ?? mod.filename).charAt(0).toUpperCase()}
                        </span>
                      )}
                      <span className="mod-name-block">
                        <span className="mod-title">
                          {mod.title ?? mod.filename.replace(/\.disabled$/, '')}
                        </span>
                        {mod.versionNumber && <span className="pill pill-version">V{mod.versionNumber}</span>}
                        {!mod.enabled && <span className="pill pill-disabled">Deaktiviert</span>}
                      </span>
                    </span>
                  </label>
                  <span className="detail-row-actions">
                    <button type="button" onClick={() => handleToggle(mod.filename)}>
                      {mod.enabled ? 'Deaktivieren' : 'Aktivieren'}
                    </button>
                    <button type="button" onClick={() => handleRemove(mod.filename)}>
                      Entfernen
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            {copyTargets.length > 0 ? (
              <div className="mod-copy-bar">
                <select value={copyTargetId} onChange={(e) => setCopyTargetId(e.target.value)}>
                  <option value="">Zielinstanz wählen…</option>
                  {copyTargets.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleCopyMods}
                  disabled={!copyTargetId || selectedInstalled.size === 0 || copying}
                >
                  {copying ? 'Kopiere…' : `Kopieren (${selectedInstalled.size})`}
                </button>
              </div>
            ) : (
              <p className="instance-meta">
                Keine kompatible Instanz (gleiche Version + Loader) zum Kopieren gefunden.
              </p>
            )}
            {copyMessage && <p className="instance-meta">{copyMessage}</p>}
          </>
        )}
      </section>

      <section className="mods-add-section">
        <h3>Mods hinzufügen</h3>

        <div className="mods-add-source">
          <button type="button" className="save-button" onClick={() => setShowModBrowser(true)}>
            Modrinth durchsuchen…
          </button>
        </div>

        <div className="mods-add-subsection">
          <div className="mod-section-header">
            <h4>Empfohlene Mods</h4>
            <button type="button" onClick={toggleCuratedSection}>
              {showCurated ? '▲ Verbergen' : '▼ Anzeigen'}
            </button>
          </div>

          {showCurated &&
            (loadingCurated ? (
              <p className="instance-meta">Lade Empfehlungen…</p>
            ) : (
              <>
                <div className="mod-section-header">
                  <p className="instance-meta">{selectableCurated.length} verfügbar</p>
                  <button
                    type="button"
                    onClick={toggleSelectAllCurated}
                    disabled={selectableCurated.length === 0}
                  >
                    {allCuratedSelected ? 'Alle abwählen' : 'Alle auswählen'}
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
                                {!mod.compatible && <span className="pill pill-disabled">Nicht kompatibel</span>}
                                {mod.compatible && installed.some((m) => m.filename.includes(mod.slug)) && (
                                  <span className="pill pill-version">Installiert</span>
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
                  {installingBatch ? 'Installiere…' : `Ausgewählte installieren (${selectedCurated.size})`}
                </button>
              </>
            ))}
        </div>

        <div className="mods-add-subsection">
          <h4>Manuell Mods hinzufügen</h4>
          <p className="instance-meta">
            Prüft eine heruntergeladene .jar-Datei (z.B. von Discord) gegen Modrinths bekannte Dateien -
            nützlich, um zu sehen, ob eine dir zugeschickte Mod wirklich das ist, was sie zu sein
            vorgibt.
          </p>
          <button type="button" onClick={handlePickFileToCheck} disabled={checking}>
            {checking ? 'Prüfe…' : 'Datei auswählen…'}
          </button>

          {checkResult && (
            <div className="mod-check-result">
              {checkResult.status === 'verified' && (
                <p className="mod-check-ok">
                  Bestätigt: Das ist <strong>{checkResult.matchedProject?.title ?? checkResult.filename}</strong>
                  {checkResult.matchedVersionNumber ? `, Version ${checkResult.matchedVersionNumber}` : ''} -
                  identisch mit der offiziellen Modrinth-Datei.
                </p>
              )}
              {checkResult.status === 'nameMismatch' && checkResult.matchedProject && (
                <p className="error">
                  Warnung: Diese Datei ist tatsächlich <strong>{checkResult.matchedProject.title}</strong>
                  {checkResult.matchedVersionNumber ? ` (${checkResult.matchedVersionNumber})` : ''}
                  {checkResult.claimedProject
                    ? `, nicht ${checkResult.claimedProject.title} wie der Dateiname suggeriert.`
                    : ', nicht was der Dateiname suggeriert.'}
                </p>
              )}
              {checkResult.status === 'nameMismatch' && !checkResult.matchedProject && (
                <p className="error">
                  Warnung: Der Dateiname deutet auf <strong>{checkResult.claimedProject?.title}</strong> hin,
                  aber diese Datei stimmt mit keiner offiziellen Version davon überein - möglicherweise
                  verändert oder gefälscht.
                </p>
              )}
              {checkResult.status === 'unrecognized' && (
                <p className="error">
                  Warnung: Diese Datei wurde nicht auf Modrinth gefunden. Das kann eine legitime Mod
                  sein, die nicht über Modrinth vertrieben wird - trotzdem Vorsicht walten lassen.
                </p>
              )}
              <div className="modal-actions">
                <button type="button" onClick={() => setCheckResult(null)}>
                  Verwerfen
                </button>
                <button type="button" onClick={handleInstallChecked} disabled={installingChecked}>
                  {installingChecked
                    ? 'Installiere…'
                    : checkResult.status === 'verified'
                      ? 'Installieren'
                      : 'Trotzdem installieren'}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      {showModBrowser && (
        <ModBrowserDialog
          instance={instance}
          onClose={() => setShowModBrowser(false)}
          onInstalled={refreshInstalled}
        />
      )}
    </div>
  )
}

export default ModsTab
