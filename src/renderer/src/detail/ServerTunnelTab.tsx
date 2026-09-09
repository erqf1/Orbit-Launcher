import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { ServerInstance } from '../types'

interface Props {
  server: ServerInstance
  onChanged: () => void
}

// playit.gg was chosen (over Tailscale) specifically so friends need zero
// setup - only the host runs this. Confirmed live by actually running the
// downloaded agent: it has NO headless "print a claim URL, then poll until
// claimed" mode - without an already-claimed secret it just waits forever
// for its own GUI companion app over IPC. The only real automatable path is
// a secret key the user generates once themselves via playit's web wizard
// (requires their own playit.gg login, which is exactly why this can't be
// automated further) and pastes in below - after that, starting/stopping
// (including auto-start alongside the server, see the checkbox below) is
// fully hands-off.
const PLAYIT_WIZARD_URL = 'https://playit.gg/account/setup/wizard/new-account/docker/docker-name'

function ServerTunnelTab({ server, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [secretKeyInput, setSecretKeyInput] = useState('')
  const [manualAddress, setManualAddress] = useState(server.tunnelPublicAddress ?? '')
  const [autoStart, setAutoStart] = useState(server.tunnelEnabled)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedKey, setSavedKey] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)

  useEffect(() => {
    let cancelled = false
    window.api.getTunnelStatus(server.id).then((value) => {
      if (!cancelled) setRunning(value)
    })
    return () => {
      cancelled = true
    }
  }, [server.id])

  useEffect(() => {
    const offLog = window.api.onTunnelLog((event) => {
      if (event.serverId !== server.id) return
      setLogs((prev) => [...prev, event.line])
    })
    const offAddress = window.api.onTunnelAddressAssigned((event) => {
      if (event.serverId !== server.id) return
      // Only auto-fill if the user hasn't already typed/saved something -
      // never clobber a value they entered themselves.
      setManualAddress((prev) => prev || event.address)
      onChanged()
    })
    const offClosed = window.api.onTunnelClosed((event) => {
      if (event.serverId !== server.id) return
      setRunning(false)
    })
    return () => {
      offLog()
      offAddress()
      offClosed()
    }
  }, [server.id, onChanged])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs])

  async function handleSaveSecretKey(): Promise<void> {
    const trimmed = secretKeyInput.trim()
    if (!trimmed) return
    await window.api.setTunnelSecretKey(server.id, trimmed)
    setSecretKeyInput('')
    setSavedKey(true)
    setTimeout(() => setSavedKey(false), 2000)
    onChanged()
  }

  async function handleClearSecretKey(): Promise<void> {
    await window.api.setTunnelSecretKey(server.id, null)
    onChanged()
  }

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
      await window.api.startTunnel(server.id, server.serverPort)
      setRunning(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleStop(): Promise<void> {
    await window.api.stopTunnel(server.id)
    setRunning(false)
  }

  async function handleSaveManualAddress(): Promise<void> {
    await window.api.updateHostedServerSettings(server.id, {
      tunnelPublicAddress: manualAddress.trim() || null
    })
    onChanged()
  }

  return (
    <div className="detail-tab">
      <p className="instance-meta">{t('serverHost.tunnel.explainer')}</p>

      <section className="settings-section">
        <h4 className="settings-section-title">{t('serverHost.tunnel.secretTitle')}</h4>
        {server.tunnelSecretKey ? (
          <>
            <p className="instance-meta">{t('serverHost.tunnel.secretConfigured')}</p>
            <button type="button" onClick={handleClearSecretKey}>
              {t('serverHost.tunnel.secretClear')}
            </button>
          </>
        ) : (
          <>
            <p className="instance-meta">{t('serverHost.tunnel.secretExplainer')}</p>
            <button type="button" onClick={() => window.api.openTunnelClaimUrl(PLAYIT_WIZARD_URL)}>
              {t('serverHost.tunnel.secretGetKey')}
            </button>
            <div className="field-row">
              <input
                value={secretKeyInput}
                onChange={(e) => setSecretKeyInput(e.target.value)}
                placeholder={t('serverHost.tunnel.secretPlaceholder')}
              />
              <button type="button" onClick={handleSaveSecretKey} disabled={!secretKeyInput.trim()}>
                {t('common.save')}
              </button>
            </div>
            {savedKey && <span className="instance-meta">{t('common.saved')}</span>}
          </>
        )}
      </section>

      {server.tunnelSecretKey && (
        <>
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
          </div>

          {error && <p className="error">{error}</p>}

          {running && (
            <pre className="log" ref={logRef}>
              {logs.length > 0 ? logs.join('\n') : t('serverHost.tunnel.noLog')}
            </pre>
          )}
        </>
      )}

      <section className="settings-section">
        <h4 className="settings-section-title">{t('serverHost.tunnel.manualTitle')}</h4>
        <p className="instance-meta">{t('serverHost.tunnel.manualExplainer')}</p>
        <div className="field-row">
          <input
            value={manualAddress}
            onChange={(e) => setManualAddress(e.target.value)}
            placeholder={t('serverHost.tunnel.manualPlaceholder')}
          />
          <button type="button" onClick={handleSaveManualAddress}>
            {t('common.save')}
          </button>
        </div>
        {server.tunnelPublicAddress && (
          <p className="instance-meta">
            {t('serverHost.tunnel.currentAddress', { address: server.tunnelPublicAddress })}
          </p>
        )}
      </section>
    </div>
  )
}

export default ServerTunnelTab
