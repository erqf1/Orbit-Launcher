import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { ServerInstance } from '../types'

interface Props {
  server: ServerInstance
  onChanged: () => void
}

// playit.gg was chosen (over Tailscale) specifically so friends need zero
// setup - only the host runs this. The raw agent log is always shown
// alongside the parsed claim/address banners rather than hidden behind a
// bare spinner, since it's genuinely unconfirmed (see playitTunnel.ts's own
// comment) whether the address-parsing heuristic catches every real agent
// output shape - a manual paste field is the fallback either way.
function ServerTunnelTab({ server, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [claimUrl, setClaimUrl] = useState<string | null>(null)
  const [manualAddress, setManualAddress] = useState(server.tunnelPublicAddress ?? '')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
    const offClaim = window.api.onTunnelClaimUrl((event) => {
      if (event.serverId !== server.id) return
      setClaimUrl(event.url)
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
      offClaim()
      offAddress()
      offClosed()
    }
  }, [server.id, onChanged])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs])

  async function handleStart(): Promise<void> {
    setStarting(true)
    setError(null)
    try {
      setLogs([])
      setClaimUrl(null)
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
      tunnelEnabled: !!manualAddress.trim(),
      tunnelPublicAddress: manualAddress.trim() || null
    })
    onChanged()
  }

  return (
    <div className="detail-tab">
      <p className="instance-meta">{t('serverHost.tunnel.explainer')}</p>

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

      {claimUrl && (
        <p className="error">
          {t('serverHost.tunnel.claimNeeded')}{' '}
          <button type="button" onClick={() => window.api.openTunnelClaimUrl(claimUrl)}>
            {t('serverHost.tunnel.claimButton')}
          </button>
        </p>
      )}

      {running && (
        <pre className="log" ref={logRef}>
          {logs.length > 0 ? logs.join('\n') : t('serverHost.tunnel.noLog')}
        </pre>
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
