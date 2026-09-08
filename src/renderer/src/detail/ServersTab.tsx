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

  async function handleToggleAutoJoin(serverIp: string): Promise<void> {
    const nowActive = instance.autoJoinServer === serverIp
    await window.api.updateInstanceSettings(instance.id, { autoJoinServer: nowActive ? null : serverIp })
    onChanged()
  }

  return (
    <div className="detail-tab mods-tab">
      <div className="mods-tab-columns">
        <section className="mods-installed-section">
          <h3>{servers.length} Server</h3>

          {error && <p className="error">{error}</p>}

          {loading ? (
            <p className="instance-meta">Lade…</p>
          ) : servers.length === 0 ? (
            <p className="instance-meta">Keine Server in der Liste.</p>
          ) : (
            <ul className="mod-list mods-installed-list">
              {servers.map((s, i) => {
                const isAutoJoin = instance.autoJoinServer === s.ip
                return (
                  <li key={`${s.name}-${i}`}>
                    <span className="mod-row">
                      {s.iconDataUrl ? (
                        <img className="mod-icon" src={s.iconDataUrl} alt="" />
                      ) : (
                        <span className="mod-icon mod-icon-fallback">{s.name.charAt(0).toUpperCase()}</span>
                      )}
                      <span className="mod-name-block">
                        <span className="mod-title">{s.name}</span>
                        <span className="pill pill-version">{s.ip}</span>
                        {isAutoJoin && <span className="pill pill-version">Automatisch beitreten</span>}
                      </span>
                    </span>
                    <span className="detail-row-actions">
                      <button type="button" onClick={() => handleToggleAutoJoin(s.ip)}>
                        {isAutoJoin ? 'Automatisch entfernen' : 'Automatisch beitreten'}
                      </button>
                      <button type="button" onClick={() => handleRemove(i, s.ip)}>
                        Entfernen
                      </button>
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="mods-add-section">
          <h3>Hinzufügen</h3>
          <form className="mods-add-subsection" onSubmit={handleAdd}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" />
            <input value={ip} onChange={(e) => setIp(e.target.value)} placeholder="Serveradresse" />
            <button type="submit" className="save-button" disabled={!name.trim() || !ip.trim()}>
              Hinzufügen
            </button>
          </form>
        </section>
      </div>
    </div>
  )
}

export default ServersTab
