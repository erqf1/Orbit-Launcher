import { useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { ServerInstance } from '../types'

interface Props {
  server: ServerInstance
  onChanged: () => void
}

// A curated subset of server.properties' several dozen keys - the ones a
// home-server host actually tunes routinely - rather than a generic
// key/value editor for the whole file. writeServerProperties only patches
// the keys it's given (see serverProperties.ts's comment), so every other
// key a real server generates on first boot is left completely untouched.
function ServerPropertiesTab({ server, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [eulaAccepted, setEulaAccepted] = useState(server.eulaAccepted)
  const [acceptingEula, setAcceptingEula] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.readServerProperties(server.id).then((props) => {
      if (cancelled) return
      setValues({
        motd: props.motd ?? 'A Minecraft Server',
        difficulty: props.difficulty ?? 'easy',
        gamemode: props.gamemode ?? 'survival',
        'max-players': props['max-players'] ?? '20',
        pvp: props.pvp ?? 'true',
        'online-mode': props['online-mode'] ?? 'true',
        'white-list': props['white-list'] ?? 'false'
      })
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [server.id])

  async function handleAcceptEula(): Promise<void> {
    setAcceptingEula(true)
    try {
      await window.api.acceptServerEula(server.id)
      setEulaAccepted(true)
      onChanged()
    } finally {
      setAcceptingEula(false)
    }
  }

  async function handleSave(): Promise<void> {
    await window.api.writeServerProperties(server.id, values)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  function set(key: string, value: string): void {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className="detail-tab">
      <section className="settings-section">
        <h4 className="settings-section-title">{t('serverHost.properties.eulaTitle')}</h4>
        {eulaAccepted ? (
          <p className="instance-meta">{t('serverHost.properties.eulaAccepted')}</p>
        ) : (
          <>
            <p className="instance-meta">{t('serverHost.properties.eulaText')}</p>
            <button type="button" className="save-button" onClick={handleAcceptEula} disabled={acceptingEula}>
              {t('serverHost.properties.eulaAccept')}
            </button>
          </>
        )}
      </section>

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : (
        <section className="settings-section">
          <h4 className="settings-section-title">{t('serverHost.properties.title')}</h4>
          <p className="instance-meta">{t('serverHost.properties.restartNotice')}</p>

          <label>
            {t('serverHost.properties.motd')}
            <input value={values.motd} onChange={(e) => set('motd', e.target.value)} />
          </label>

          <div className="field-row">
            <label>
              {t('serverHost.properties.difficulty')}
              <select value={values.difficulty} onChange={(e) => set('difficulty', e.target.value)}>
                <option value="peaceful">peaceful</option>
                <option value="easy">easy</option>
                <option value="normal">normal</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <label>
              {t('serverHost.properties.gamemode')}
              <select value={values.gamemode} onChange={(e) => set('gamemode', e.target.value)}>
                <option value="survival">survival</option>
                <option value="creative">creative</option>
                <option value="adventure">adventure</option>
                <option value="spectator">spectator</option>
              </select>
            </label>
          </div>

          <label>
            {t('serverHost.properties.maxPlayers')}
            <input
              type="number"
              value={values['max-players']}
              onChange={(e) => set('max-players', e.target.value)}
            />
          </label>

          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={values.pvp === 'true'}
              onChange={(e) => set('pvp', String(e.target.checked))}
            />
            {t('serverHost.properties.pvp')}
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={values['online-mode'] === 'true'}
              onChange={(e) => set('online-mode', String(e.target.checked))}
            />
            {t('serverHost.properties.onlineMode')}
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={values['white-list'] === 'true'}
              onChange={(e) => set('white-list', String(e.target.checked))}
            />
            {t('serverHost.properties.whitelist')}
          </label>

          <div className="modal-actions">
            <button type="button" className="save-button" onClick={handleSave}>
              {t('common.save')}
            </button>
            {saved && <span className="instance-meta">{t('common.saved')}</span>}
          </div>
        </section>
      )}
    </div>
  )
}

export default ServerPropertiesTab
