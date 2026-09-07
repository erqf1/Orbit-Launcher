import { useEffect, useState } from 'react'
import type { PrismInstanceSummary } from './types'

interface Props {
  onCancel: () => void
  onImported: () => void
}

function PrismImportDialog({ onCancel, onImported }: Props): React.JSX.Element {
  const [root, setRoot] = useState<string | undefined>(undefined)
  const [instances, setInstances] = useState<PrismInstanceSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function load(rootOverride?: string): void {
    setLoading(true)
    setError(null)
    window.api
      .listPrismInstances(rootOverride)
      .then(setInstances)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }

  // Only on mount - browsing a custom folder re-loads explicitly via handleBrowse.
  useEffect(() => {
    load(undefined)
  }, [])

  async function handleBrowse(): Promise<void> {
    const chosen = await window.api.browsePrismFolder()
    if (chosen) {
      setRoot(chosen)
      load(chosen)
    }
  }

  function toggle(folderName: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(folderName)) next.delete(folderName)
      else next.add(folderName)
      return next
    })
  }

  // One failing instance shouldn't lose the rest of a batch import, and
  // silently doing nothing on failure leaves the user with no idea which
  // instance(s) had a problem - so every folder is attempted independently,
  // successes always get reflected (onImported refreshes the list), and the
  // dialog only closes itself when nothing failed.
  async function handleImport(): Promise<void> {
    setError(null)
    setImporting(true)
    const failures: string[] = []
    let successCount = 0
    for (const folderName of selected) {
      try {
        await window.api.importPrismInstance(root, folderName)
        successCount++
      } catch (err) {
        failures.push(`${folderName}: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    setImporting(false)
    if (successCount > 0) onImported()
    if (failures.length > 0) {
      setError(`${failures.length} von ${selected.size} fehlgeschlagen:\n${failures.join('\n')}`)
    } else {
      onCancel()
    }
  }

  const importableCount = instances.filter(
    (i) => selected.has(i.folderName) && i.loader !== 'unsupported' && i.mcVersion
  ).length

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h2>Instanzen von Prism Launcher importieren</h2>
        <p className="instance-meta">
          Mods, Welten und Konfiguration werden übernommen. Forge/NeoForge-Instanzen können noch nicht
          importiert werden.
        </p>

        <button type="button" onClick={handleBrowse}>
          Anderen Ordner wählen…
        </button>
        {root && <p className="instance-meta">Ordner: {root}</p>}

        {loading ? (
          <p className="instance-meta">Suche Prism-Instanzen…</p>
        ) : instances.length === 0 ? (
          <p className="instance-meta">
            Keine Prism-Instanzen gefunden. Falls Prism an einem anderen Ort installiert ist, wähle den
            Ordner manuell.
          </p>
        ) : (
          <ul className="mod-list">
            {instances.map((instance) => {
              const disabled = instance.loader === 'unsupported' || !instance.mcVersion
              return (
                <li key={instance.folderName}>
                  <label className="checkbox-label mod-checkbox">
                    <input
                      type="checkbox"
                      checked={selected.has(instance.folderName)}
                      disabled={disabled}
                      onChange={() => toggle(instance.folderName)}
                    />
                    {instance.name}
                    {instance.mcVersion && ` (${instance.mcVersion}${instance.loader !== 'vanilla' && instance.loader !== 'unsupported' ? ` · ${instance.loader}` : ''})`}
                    {instance.unsupportedReason && ` — ${instance.unsupportedReason}`}
                    {!instance.mcVersion && !instance.unsupportedReason && ' — Version unbekannt'}
                  </label>
                </li>
              )
            })}
          </ul>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" onClick={handleImport} disabled={importableCount === 0 || importing}>
            {importing ? 'Importiere…' : `Importieren (${importableCount})`}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PrismImportDialog
