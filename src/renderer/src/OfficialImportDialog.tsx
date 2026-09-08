import { useEffect, useState } from 'react'

interface Props {
  onCancel: () => void
  onImported: () => void
}

// Unlike Prism, the official launcher has no separate "instances" to pick
// from - just one shared .minecraft folder - so this is a single
// confirm-and-go action instead of a list with checkboxes.
function OfficialImportDialog({ onCancel, onImported }: Props): React.JSX.Element {
  const [root, setRoot] = useState<string | null | undefined>(undefined)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    window.api.detectOfficialRoot().then(setRoot)
  }, [])

  async function handleBrowse(): Promise<void> {
    const chosen = await window.api.browseOfficialFolder()
    if (chosen) setRoot(chosen)
  }

  async function handleImport(): Promise<void> {
    setError(null)
    setImporting(true)
    try {
      await window.api.importOfficialMinecraft(root ?? undefined)
      onImported()
      onCancel()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Vom Minecraft Launcher importieren</h2>
        <p className="instance-meta">
          Welten, Resource Packs, Shader Packs, Server und Einstellungen werden als neue Instanz namens
          „Minecraft Launcher" übernommen, gesetzt auf die zuletzt gespielte Version.
        </p>

        <button type="button" onClick={handleBrowse}>
          Anderen Ordner wählen…
        </button>

        {root === undefined ? (
          <p className="instance-meta">Suche .minecraft-Ordner…</p>
        ) : root === null ? (
          <p className="instance-meta">Kein .minecraft-Ordner gefunden. Bitte manuell auswählen.</p>
        ) : (
          <p className="instance-meta">Ordner: {root}</p>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="button" className="save-button" onClick={handleImport} disabled={!root || importing}>
            {importing ? 'Importiere…' : 'Importieren'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default OfficialImportDialog
