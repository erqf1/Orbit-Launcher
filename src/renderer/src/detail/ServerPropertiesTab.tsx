import { useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { ServerInstance } from '../types'

interface Props {
  server: ServerInstance
  onChanged: () => void
}

type Category = 'general' | 'players' | 'world' | 'advanced'

const DEFAULTS: Record<string, string> = {
  motd: 'A Minecraft Server',
  difficulty: 'easy',
  gamemode: 'survival',
  hardcore: 'false',
  'max-players': '20',
  pvp: 'true',
  'online-mode': 'true',
  'white-list': 'false',
  'enforce-whitelist': 'false',
  'allow-flight': 'false',
  'spawn-protection': '16',
  'op-permission-level': '4',
  'level-seed': '',
  'level-type': 'minecraft:normal',
  'generate-structures': 'true',
  'allow-nether': 'true',
  'spawn-monsters': 'true',
  'spawn-animals': 'true',
  'spawn-npcs': 'true',
  'view-distance': '10',
  'simulation-distance': '10',
  'enable-command-block': 'false',
  'resource-pack': '',
  'resource-pack-prompt': '',
  'network-compression-threshold': '256'
}

const CATEGORY_KEYS: Record<Category, string[]> = {
  general: ['motd', 'difficulty', 'gamemode', 'hardcore'],
  players: [
    'max-players',
    'pvp',
    'online-mode',
    'white-list',
    'enforce-whitelist',
    'allow-flight',
    'spawn-protection',
    'op-permission-level'
  ],
  world: [
    'level-seed',
    'level-type',
    'generate-structures',
    'allow-nether',
    'spawn-monsters',
    'spawn-animals',
    'spawn-npcs',
    'view-distance',
    'simulation-distance'
  ],
  advanced: ['enable-command-block', 'resource-pack', 'resource-pack-prompt', 'network-compression-threshold']
}

// A curated subset of server.properties' several dozen keys - the ones a
// home-server host actually tunes routinely - rather than a generic
// key/value editor for the whole file. writeServerProperties only patches
// the keys it's given (see serverProperties.ts's comment), so every other
// key a real server generates on first boot is left completely untouched.
// Grouped into a category menu (General/Players/World/Advanced) rather
// than one long flat list, and covers the settings that matter regardless
// of loader (Paper, like every server type, still boots off this same
// server.properties file for its base vanilla/Bukkit-layer settings).
function ServerPropertiesTab({ server, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [category, setCategory] = useState<Category>('general')
  const [values, setValues] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [eulaAccepted, setEulaAccepted] = useState(server.eulaAccepted)
  const [acceptingEula, setAcceptingEula] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api.readServerProperties(server.id).then((props) => {
      if (cancelled) return
      const merged: Record<string, string> = {}
      for (const key of Object.keys(DEFAULTS)) {
        merged[key] = props[key] ?? DEFAULTS[key]
      }
      setValues(merged)
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
    setError(null)
    try {
      await window.api.writeServerProperties(server.id, values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function set(key: string, value: string): void {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function checkbox(key: string, label: string): React.JSX.Element {
    return (
      <label className="checkbox-label" key={key}>
        <input type="checkbox" checked={values[key] === 'true'} onChange={(e) => set(key, String(e.target.checked))} />
        {label}
      </label>
    )
  }

  function categoryLabel(key: Category): string {
    switch (key) {
      case 'general':
        return t('serverHost.properties.categoryGeneral')
      case 'players':
        return t('serverHost.properties.categoryPlayers')
      case 'world':
        return t('serverHost.properties.categoryWorld')
      case 'advanced':
        return t('serverHost.properties.categoryAdvanced')
    }
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
        <>
          <p className="instance-meta">{t('serverHost.properties.restartNotice')}</p>

          <div className="view-mode-switch properties-category-switch">
            {(Object.keys(CATEGORY_KEYS) as Category[]).map((key) => (
              <button
                key={key}
                type="button"
                className={category === key ? 'active' : ''}
                onClick={() => setCategory(key)}
              >
                {categoryLabel(key)}
              </button>
            ))}
          </div>

          <section className="settings-section">
            {category === 'general' && (
              <>
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
                {checkbox('hardcore', t('serverHost.properties.hardcore'))}
              </>
            )}

            {category === 'players' && (
              <>
                <label>
                  {t('serverHost.properties.maxPlayers')}
                  <input
                    type="number"
                    value={values['max-players']}
                    onChange={(e) => set('max-players', e.target.value)}
                  />
                </label>
                {checkbox('pvp', t('serverHost.properties.pvp'))}
                {checkbox('online-mode', t('serverHost.properties.onlineMode'))}
                {checkbox('white-list', t('serverHost.properties.whitelist'))}
                {checkbox('enforce-whitelist', t('serverHost.properties.enforceWhitelist'))}
                {checkbox('allow-flight', t('serverHost.properties.allowFlight'))}
                <div className="field-row">
                  <label>
                    {t('serverHost.properties.spawnProtection')}
                    <input
                      type="number"
                      value={values['spawn-protection']}
                      onChange={(e) => set('spawn-protection', e.target.value)}
                    />
                  </label>
                  <label>
                    {t('serverHost.properties.opPermissionLevel')}
                    <select
                      value={values['op-permission-level']}
                      onChange={(e) => set('op-permission-level', e.target.value)}
                    >
                      <option value="1">1</option>
                      <option value="2">2</option>
                      <option value="3">3</option>
                      <option value="4">4</option>
                    </select>
                  </label>
                </div>
              </>
            )}

            {category === 'world' && (
              <>
                <label>
                  {t('serverHost.properties.levelSeed')}
                  <input
                    value={values['level-seed']}
                    onChange={(e) => set('level-seed', e.target.value)}
                    placeholder={t('serverHost.properties.levelSeedPlaceholder')}
                  />
                </label>
                <label>
                  {t('serverHost.properties.levelType')}
                  <select value={values['level-type']} onChange={(e) => set('level-type', e.target.value)}>
                    <option value="minecraft:normal">normal</option>
                    <option value="minecraft:flat">flat</option>
                    <option value="minecraft:large_biomes">large_biomes</option>
                    <option value="minecraft:amplified">amplified</option>
                  </select>
                </label>
                {checkbox('generate-structures', t('serverHost.properties.generateStructures'))}
                {checkbox('allow-nether', t('serverHost.properties.allowNether'))}
                {checkbox('spawn-monsters', t('serverHost.properties.spawnMonsters'))}
                {checkbox('spawn-animals', t('serverHost.properties.spawnAnimals'))}
                {checkbox('spawn-npcs', t('serverHost.properties.spawnNpcs'))}
                <div className="field-row">
                  <label>
                    {t('serverHost.properties.viewDistance')}
                    <input
                      type="number"
                      value={values['view-distance']}
                      onChange={(e) => set('view-distance', e.target.value)}
                    />
                  </label>
                  <label>
                    {t('serverHost.properties.simulationDistance')}
                    <input
                      type="number"
                      value={values['simulation-distance']}
                      onChange={(e) => set('simulation-distance', e.target.value)}
                    />
                  </label>
                </div>
              </>
            )}

            {category === 'advanced' && (
              <>
                {checkbox('enable-command-block', t('serverHost.properties.enableCommandBlock'))}
                <label>
                  {t('serverHost.properties.resourcePack')}
                  <input
                    value={values['resource-pack']}
                    onChange={(e) => set('resource-pack', e.target.value)}
                    placeholder="https://…"
                  />
                </label>
                <label>
                  {t('serverHost.properties.resourcePackPrompt')}
                  <input
                    value={values['resource-pack-prompt']}
                    onChange={(e) => set('resource-pack-prompt', e.target.value)}
                  />
                </label>
                <label>
                  {t('serverHost.properties.networkCompressionThreshold')}
                  <input
                    type="number"
                    value={values['network-compression-threshold']}
                    onChange={(e) => set('network-compression-threshold', e.target.value)}
                  />
                </label>
              </>
            )}

            {error && <p className="error">{error}</p>}
            <div className="modal-actions">
              <button type="button" className="save-button" onClick={handleSave}>
                {t('common.save')}
              </button>
              {saved && <span className="instance-meta">{t('common.saved')}</span>}
            </div>
          </section>
        </>
      )}
    </div>
  )
}

export default ServerPropertiesTab
