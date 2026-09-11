import { useEffect, useState } from 'react'
import { useLocale } from './i18n'
import type { PlayitTunnelConfig } from './types'
import { useBackdropClose } from './useBackdropClose'

interface Props {
  onCancel: () => void
  onChanged: () => void
}

// One shared playit.gg agent/tunnel for the whole launcher (see
// appSettings.ts's playitSecretKey/playitTunnelPort/playitTunnelAddress)
// instead of a separate secret key + tunnel per hosted server - the manual
// "create a tunnel" step on playit.gg's own dashboard can't be automated
// (confirmed with their support team, no API for it even on paid plans), so
// this makes it a one-time launcher-wide setup instead of a per-server one.
// The tradeoff (only one hosted server can run - and be reachable through
// it - at a time) is enforced in serverProcess.ts's startServer.
const PLAYIT_WIZARD_URL = 'https://playit.gg/account/setup/wizard/new-account/docker/docker-name'
const PLAYIT_NEW_TUNNEL_URL = 'https://playit.gg/account/setup/new-tunnel'

function PlayitSettingsDialog({ onCancel, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [config, setConfig] = useState<PlayitTunnelConfig | null>(null)
  const [secretKeyInput, setSecretKeyInput] = useState('')
  const [portInput, setPortInput] = useState('25565')
  const [addressInput, setAddressInput] = useState('')
  const [savedKey, setSavedKey] = useState(false)
  const [savedPort, setSavedPort] = useState(false)
  const [savedAddress, setSavedAddress] = useState(false)
  const [running, setRunning] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connectError, setConnectError] = useState<string | null>(null)

  function load(): void {
    window.api.getPlayitTunnelConfig().then((result) => {
      setConfig(result)
      setPortInput(String(result.localPort))
      setAddressInput(result.publicAddress ?? '')
    })
  }

  useEffect(load, [])

  useEffect(() => {
    window.api.getTunnelStatus().then(setRunning)
  }, [])

  useEffect(() => {
    const offAddress = window.api.onTunnelAddressAssigned(() => {
      load()
      onChanged()
    })
    const offClosed = window.api.onTunnelClosed(() => setRunning(false))
    return () => {
      offAddress()
      offClosed()
    }
  }, [onChanged])

  // The agent only shows up as "online" in playit.gg's own "assign to
  // agent" tunnel-creation picker while it's actually connected - without
  // this, the user would have to separately start a hosted server (or find
  // the manual Start button buried in a server's Tunnel tab) just to make
  // the agent visible there at all before they can even create the tunnel.
  async function connectAgent(): Promise<void> {
    setConnecting(true)
    setConnectError(null)
    try {
      await window.api.startTunnel()
      setRunning(true)
    } catch (err) {
      setConnectError(err instanceof Error ? err.message : String(err))
    } finally {
      setConnecting(false)
    }
  }

  async function handleDisconnectAgent(): Promise<void> {
    await window.api.stopTunnel()
    setRunning(false)
  }

  async function handleSaveSecretKey(): Promise<void> {
    const trimmed = secretKeyInput.trim()
    if (!trimmed) return
    await window.api.setPlayitSecretKey(trimmed)
    setSecretKeyInput('')
    setSavedKey(true)
    setTimeout(() => setSavedKey(false), 2000)
    load()
    onChanged()
    void connectAgent()
  }

  async function handleClearSecretKey(): Promise<void> {
    if (running) await handleDisconnectAgent()
    await window.api.setPlayitSecretKey(null)
    load()
    onChanged()
  }

  async function handleSavePort(): Promise<void> {
    const port = Number(portInput)
    if (!Number.isInteger(port) || port <= 0 || port >= 65536) return
    await window.api.setPlayitTunnelPort(port)
    setSavedPort(true)
    setTimeout(() => setSavedPort(false), 2000)
    load()
    onChanged()
  }

  async function handleSaveAddress(): Promise<void> {
    await window.api.setPlayitTunnelAddress(addressInput.trim() || null)
    setSavedAddress(true)
    setTimeout(() => setSavedAddress(false), 2000)
    load()
    onChanged()
  }

  const portValid = /^\d+$/.test(portInput) && Number(portInput) > 0 && Number(portInput) < 65536

  return (
    <div className="modal-backdrop" {...useBackdropClose(onCancel)}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t('playitSettings.title')}</h2>
        <p className="instance-meta">{t('playitSettings.explainer')}</p>

        <section className="settings-section">
          <h4 className="settings-section-title">{t('serverHost.tunnel.secretTitle')}</h4>
          {config?.secretKey ? (
            <>
              <p className="instance-meta">{t('serverHost.tunnel.secretConfigured')}</p>
              <button type="button" onClick={handleClearSecretKey}>
                {t('serverHost.tunnel.secretClear')}
              </button>
            </>
          ) : (
            <>
              <p className="instance-meta">{t('serverHost.tunnel.secretExplainer')}</p>
              <button type="button" onClick={() => window.api.openExternalUrl(PLAYIT_WIZARD_URL)}>
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

        <section className="settings-section">
          <h4 className="settings-section-title">{t('playitSettings.portTitle')}</h4>
          <p className="instance-meta">{t('playitSettings.portExplainer')}</p>
          <div className="field-row">
            <input value={portInput} onChange={(e) => setPortInput(e.target.value)} placeholder="25565" />
            <button type="button" onClick={handleSavePort} disabled={!portValid}>
              {t('common.save')}
            </button>
          </div>
          {savedPort && <span className="instance-meta">{t('common.saved')}</span>}
        </section>

        {config?.secretKey && (
          <section className="settings-section">
            <h4 className="settings-section-title">{t('serverHost.tunnel.createTunnelTitle')}</h4>
            <p className="instance-meta">{t('serverHost.tunnel.createTunnelExplainer')}</p>

            <div className="detail-tab-header">
              {running ? (
                <>
                  <span className="instance-meta">{t('playitSettings.agentOnline')}</span>
                  <button type="button" onClick={handleDisconnectAgent}>
                    {t('playitSettings.disconnectAgent')}
                  </button>
                </>
              ) : (
                <button type="button" className="save-button" onClick={connectAgent} disabled={connecting}>
                  {connecting ? t('playitSettings.connecting') : t('playitSettings.connectAgent')}
                </button>
              )}
            </div>
            {connectError && <p className="error">{connectError}</p>}

            <ol className="tunnel-tutorial-steps">
              <li>{t('serverHost.tunnel.tutorialStep1')}</li>
              <li>{t('serverHost.tunnel.tutorialStep2', { port: portInput })}</li>
              <li>{t('serverHost.tunnel.tutorialStep3')}</li>
              <li>{t('serverHost.tunnel.tutorialStep4')}</li>
            </ol>
            <button type="button" onClick={() => window.api.openExternalUrl(PLAYIT_NEW_TUNNEL_URL)}>
              {t('serverHost.tunnel.createTunnelButton')}
            </button>
          </section>
        )}

        <section className="settings-section">
          <h4 className="settings-section-title">{t('serverHost.tunnel.manualTitle')}</h4>
          <p className="instance-meta">{t('serverHost.tunnel.manualExplainer')}</p>
          <div className="field-row">
            <input
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              placeholder={t('serverHost.tunnel.manualPlaceholder')}
            />
            <button type="button" onClick={handleSaveAddress}>
              {t('common.save')}
            </button>
          </div>
          {savedAddress && <span className="instance-meta">{t('common.saved')}</span>}
        </section>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t('common.close')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default PlayitSettingsDialog
