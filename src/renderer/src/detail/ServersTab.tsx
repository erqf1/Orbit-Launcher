import { useCallback, useEffect, useState } from 'react'
import type { Instance, ServerEntry } from '../types'

interface Props {
  instance: Instance
  onChanged: () => void
}

function ServersTab({ instance, onChanged }: Props): React.JSX.Element {
  const [servers, setServers] = useState<ServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listServers(instance.id)
      .then(setServers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [instance.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleAdd(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !ip.trim()) return
    setError(null)
    try {
      await window.api.addServer(instance.id, name.trim(), ip.trim())
      setName('')
      setIp('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(index: number, serverIp: string): Promise<void> {
    await window.api.removeServer(instance.id, index)
    if (instance.autoJoinServer === serverIp) {
      await window.api.updateInstanceSettings(instance.id, { autoJoinServer: null })
      onChanged()
    }
    refresh()
  }

  async function handleSetAutoJoin(serverIp: string, checked: boolean): Promise<void> {
    await window.api.updateInstanceSettings(instance.id, { autoJoinServer: checked ? serverIp : null })
    onChanged()
  }

  return (
    <div className="detail-tab">
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">Lade…</p>
      ) : servers.length === 0 ? (
        <p className="instance-meta">Keine Server in der Liste.</p>
      ) : (
        <ul className="mod-list">
          {servers.map((s, i) => (
            <li key={`${s.name}-${i}`}>
              <label className="checkbox-label mod-checkbox">
                <input
                  type="checkbox"
                  checked={instance.autoJoinServer === s.ip}
                  onChange={(e) => handleSetAutoJoin(s.ip, e.target.checked)}
                  title="Automatisch beitreten"
                />
                <span>
                  {s.name} · {s.ip}
                  {instance.autoJoinServer === s.ip && (
                    <span className="pill pill-version">Automatisch beitreten</span>
                  )}
                </span>
              </label>
              <button type="button" onClick={() => handleRemove(i, s.ip)}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="mod-search" onSubmit={handleAdd}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="Serveradresse" />
        <button type="submit" disabled={!name.trim() || !ip.trim()}>
          Hinzufügen
        </button>
      </form>
    </div>
  )
}

export default ServersTab
