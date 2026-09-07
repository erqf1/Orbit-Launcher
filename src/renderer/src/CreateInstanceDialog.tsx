import { useEffect, useState } from 'react'
import type { MinecraftVersionSummary } from './types'

interface Props {
  onCancel: () => void
  onCreate: (name: string, mcVersion: string) => void
}

function CreateInstanceDialog({ onCancel, onCreate }: Props): React.JSX.Element {
  const [versions, setVersions] = useState<MinecraftVersionSummary[]>([])
  const [loadingVersions, setLoadingVersions] = useState(true)
  const [name, setName] = useState('Neue Instanz')
  const [mcVersion, setMcVersion] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .listVersions()
      .then((list) => {
        if (cancelled) return
        const releases = list.filter((v) => v.type === 'release')
        setVersions(releases)
        if (releases.length > 0) setMcVersion(releases[0].id)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoadingVersions(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (!name.trim() || !mcVersion) return
    onCreate(name.trim(), mcVersion)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Neue Instanz</h2>

        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <label>
          Minecraft-Version
          {loadingVersions ? (
            <p>Lade Versionen…</p>
          ) : (
            <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
              {versions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.id}
                </option>
              ))}
            </select>
          )}
        </label>

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" disabled={loadingVersions || !mcVersion}>
            Erstellen
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateInstanceDialog
