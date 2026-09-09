import { useEffect, useRef, useState } from 'react'
import PlayitSettingsDialog from '../PlayitSettingsDialog'
import { useLocale } from '../i18n'
import type { PlayitTunnelConfig, ServerInstance } from '../types'

interface Props {
  server: ServerInstance
  onChanged: () => void
}

// playit.gg is one shared account-wide agent/tunnel now (see
// PlayitSettingsDialog and appSettings.ts) rather than a per-server setup -
// this tab just starts/stops that shared tunnel for this server and toggles
// whether it should auto-start when this server does. Secret key, tunnel
// port, and the assigned public address are all configured once, from
// anywhere, via PlayitSettingsDialog.
function ServerTunnelTab({ server, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [config, setConfig] = useState<PlayitTunnelConfig | null>(null)
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [autoStart, setAutoStart] = useState(server.tunnelEnabled)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  function loadConfig(): void {
    window.api.getPlayitTunnelConfig().then(setConfig)
  }

  useEffect(loadConfig, [])

  useEffect(() => {
    let cancelled = false
    window.api.getTunnelStatus().then((value) => {
      if (!cancelled) setRunning(value)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const offLog = window.api.onTunnelLog((event) => {
      setLogs((prev) => [...prev, event.line])
    })
    const offAddress = window.api.onTunnelAddressAssigned(() => {
      loadConfig()
      onChanged()
    })
    const offClosed = window.api.onTunnelClosed(() => {
      setRunning(false)
    })
    return () => {
      offLog()
      offAddress()
      offClosed()
    }
  }, [onChanged])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs])

  async function handleToggleAutoStart(value: boolean): Promise<void> {
    setAutoStart(value)
    await window.api.updateHostedServerSettings(server.id, { tunnelEnabled: value })
    onChanged()
  }

  async function handleStart(): Promise<void> {
    setStarting(true)
    setError(null)
    try {
      setLogs([])
      await window.api.startTunnel(server.serverPort)
      setRunning(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleStop(): Promise<void> {
    await window.api.stopTunnel()
    setRunning(false)
  }

  function handleSettingsClosed(): void {
    setShowSettings(false)
    loadConfig()
  }

  return (
    <div className="detail-tab">
      <p className="instance-meta">{t('serverHost.tunnel.explainer')}</p>

      {!config?.secretKey ? (
        <section className="settings-section">
          <p className="instance-meta">{t('serverHost.tunnel.notConfigured')}</p>
          <button type="button" className="save-button" onClick={() => setShowSettings(true)}>
            {t('serverHost.tunnel.openSettings')}
          </button>
        </section>
      ) : (
        <>
          {server.serverPort !== config.localPort && (
            <p className="error">
              {t('serverHost.tunnel.portMismatch', { serverPort: String(server.serverPort), tunnelPort: String(config.localPort) })}
            </p>
          )}

          <label className="checkbox-label">
            <input type="checkbox" checked={autoStart} onChange={(e) => handleToggleAutoStart(e.target.checked)} />
            {t('serverHost.tunnel.autoStart')}
          </label>

          <div className="detail-tab-header">
            {running ? (
              <button type="button" onClick={handleStop}>
                {t('serverHost.tunnel.stop')}
              </button>
            ) : (
              <button type="button" className="save-button" onClick={handleStart} disabled={starting}>
                {starting ? t('serverHost.tunnel.starting') : t('serverHost.tunnel.start')}
              </button>
            )}
            <button type="button" onClick={() => setShowSettings(true)}>
              {t('serverHost.tunnel.openSettings')}
            </button>
          </div>

          {error && <p className="error">{error}</p>}

          {running && (
            <pre className="log" ref={logRef}>
              {logs.length > 0 ? logs.join('\n') : t('serverHost.tunnel.noLog')}
            </pre>
          )}

          {config.publicAddress && (
            <p className="instance-meta">
              {t('serverHost.tunnel.currentAddress', { address: config.publicAddress })}
            </p>
          )}
        </>
      )}

      {showSettings && <PlayitSettingsDialog onCancel={handleSettingsClosed} onChanged={loadConfig} />}
    </div>
  )
}

export default ServerTunnelTab
