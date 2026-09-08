import { useCallback, useEffect, useState } from 'react'
import type { CuratedMod, Instance, InstalledMod, ModSearchResult } from '../types'

interface Props {
  instance: Instance
  allInstances: Instance[]
}

function ModsTab({ instance, allInstances }: Props): React.JSX.Element {
  const [installed, setInstalled] = useState<InstalledMod[]>([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ModSearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const [showCurated, setShowCurated] = useState(false)
  const [curated, setCurated] = useState<CuratedMod[]>([])
  const [loadingCurated, setLoadingCurated] = useState(false)
  const [selectedCurated, setSelectedCurated] = useState<Set<string>>(new Set())
  const [installingBatch, setInstallingBatch] = useState(false)

  const [selectedInstalled, setSelectedInstalled] = useState<Set<string>>(new Set())
  const [copyTargetId, setCopyTargetId] = useState('')
  const [copying, setCopying] = useState(false)
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
      const deps = await installOne(projectId)
      refreshInstalled()
      if (deps.length > 0) {
        const names = deps.map((d) => d.title).join(', ')
        if (window.confirm(`Benötigt außerdem: ${names}. Jetzt mitinstallieren?`)) {
          for (const dep of deps) await installOne(dep.projectId)
          refreshInstalled()
        }
      }
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

  async function handleToggle(filename: string): Promise<void> {
    await window.api.toggleModEnabled(instance.id, filename)
    refreshInstalled()
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
    <div className="detail-tab">
      <section>
        <h3>Installiert ({installed.length})</h3>
        {installed.length === 0 ? (
          <p className="instance-meta">Keine Mods installiert.</p>
        ) : (
          <>
            <ul className="mod-list">
              {installed.map((mod) => (
                <li key={mod.filename} className={mod.enabled ? '' : 'mod-disabled'}>
                  <label className="checkbox-label mod-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedInstalled.has(mod.filename)}
                      onChange={() => toggleInstalledSelected(mod.filename)}
                    />
                    <span>
                      {mod.filename.replace(/\.disabled$/, '')}
                      {!mod.enabled && ' (deaktiviert)'}
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

      <section>
        <div className="mod-section-header">
          <h3>Empfohlene Mods</h3>
          <button type="button" onClick={toggleCuratedSection}>
            {showCurated ? 'Verbergen' : 'Anzeigen'}
          </button>
        </div>

        {showCurated &&
          (loadingCurated ? (
            <p className="instance-meta">Lade Empfehlungen…</p>
          ) : (
            <>
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
                          {mod.title}
                          {!mod.compatible && ' (nicht kompatibel)'}
                        </label>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <button
                type="button"
                onClick={handleInstallSelected}
                disabled={selectedCurated.size === 0 || installingBatch}
              >
                {installingBatch ? 'Installiere…' : `Ausgewählte installieren (${selectedCurated.size})`}
              </button>
            </>
          ))}
      </section>

      <section>
        <h3>Modrinth durchsuchen</h3>
        <form className="mod-search" onSubmit={handleSearch}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Mod-Name…" />
          <button type="submit" disabled={searching || !query.trim()}>
            {searching ? 'Suche…' : 'Suchen'}
          </button>
        </form>

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

      {error && <p className="error">{error}</p>}
    </div>
  )
}

export default ModsTab
