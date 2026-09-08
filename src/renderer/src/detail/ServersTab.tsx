import { useCallback, useEffect, useState } from 'react'
import type { ServerEntry } from '../types'

interface Props {
  instanceId: string
}

function ServersTab({ instanceId }: Props): React.JSX.Element {
  const [servers, setServers] = useState<ServerEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [ip, setIp] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listServers(instanceId)
      .then(setServers)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [instanceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleAdd(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !ip.trim()) return
    setError(null)
    try {
      await window.api.addServer(instanceId, name.trim(), ip.trim())
      setName('')
      setIp('')
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleRemove(index: number): Promise<void> {
    await window.api.removeServer(instanceId, index)
    refresh()
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
              <span>
                {s.name} · {s.ip}
              </span>
              <button type="button" onClick={() => handleRemove(i)}>
                Entfernen
              </button>
            </li>
          ))}
        </ul>
      )}

      <form className="mod-search" onSubmit={handleAdd}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
        <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="host:port" />
        <button type="submit" disabled={!name.trim() || !ip.trim()}>
          Hinzufügen
        </button>
      </form>
    </div>
  )
}

export default ServersTab
