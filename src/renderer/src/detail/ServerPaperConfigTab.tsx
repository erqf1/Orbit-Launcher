import { useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import FileConfigBrowser from './FileConfigBrowser'
import type { PaperConfigValue, ServerInstance } from '../types'

interface Props {
  server: ServerInstance
}

type Category = 'performance' | 'mobs' | 'gameplay' | 'network'

// Real defaults verified live against a booted 1.21 Paper server's
// config/paper-global.yml and config/paper-world-defaults.yml - kept here as
// the renderer's own copy since readPaperConfig only returns keys that are
// actually present on disk merged with the main process's registry
// (main/servers/paperConfig.ts's PAPER_CONFIG_FIELDS is the source of truth
// for which keys exist and where they live; this object exists purely so
// the form has something to render before the read call resolves).
const DEFAULTS: Record<string, PaperConfigValue> = {
  chunkSendRate: 75,
  chunkLoadRate: 100,
  ioThreads: -1,
  workerThreads: -1,
  maxAutoSaveChunksPerTick: 24,
  tickRateMobSpawner: 1,
  tickRateContainerUpdate: 1,
  spawnLimitMonster: -1,
  spawnLimitCreature: -1,
  spawnLimitAmbient: -1,
  spawnLimitWaterAmbient: -1,
  maxEntityCollisions: 8,
  antiXrayEnabled: false,
  antiXrayEngineMode: 1,
  disableExplosionKnockback: false,
  disableIceAndSnow: false,
  disableThunder: false,
  hopperCooldownWhenFull: true,
  hopperIgnoreOccludingBlocks: false,
  lootablesAutoReplenish: false,
  redstoneImplementation: 'VANILLA',
  fishingTimeMin: 100,
  fishingTimeMax: 600,
  velocityEnabled: false,
  velocityOnlineMode: true,
  velocitySecret: '',
  bungeeCordOnlineMode: true,
  updateCheckerEnabled: true
}

const CATEGORY_KEYS: Record<Category, string[]> = {
  performance: [
    'chunkSendRate',
    'chunkLoadRate',
    'ioThreads',
    'workerThreads',
    'maxAutoSaveChunksPerTick',
    'tickRateMobSpawner',
    'tickRateContainerUpdate'
  ],
  mobs: [
    'spawnLimitMonster',
    'spawnLimitCreature',
    'spawnLimitAmbient',
    'spawnLimitWaterAmbient',
    'maxEntityCollisions',
    'antiXrayEnabled',
    'antiXrayEngineMode'
  ],
  gameplay: [
    'disableExplosionKnockback',
    'disableIceAndSnow',
    'disableThunder',
    'hopperCooldownWhenFull',
    'hopperIgnoreOccludingBlocks',
    'lootablesAutoReplenish',
    'redstoneImplementation',
    'fishingTimeMin',
    'fishingTimeMax'
  ],
  network: ['velocityEnabled', 'velocityOnlineMode', 'velocitySecret', 'bungeeCordOnlineMode', 'updateCheckerEnabled']
}

// Structured editor for the handful of paper-global.yml/paper-world-defaults.yml
// settings people actually tune (same curated-subset call as
// ServerPropertiesTab.tsx made for server.properties) - the "Raw Files"
// toggle below falls back to FileConfigBrowser for anything not covered
// here, same file layout ServerPluginsTab already uses for per-plugin
// config.
function ServerPaperConfigTab({ server }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [category, setCategory] = useState<Category>('performance')
  const [values, setValues] = useState<Record<string, PaperConfigValue>>({})
  const [loading, setLoading] = useState(true)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api.readPaperConfig(server.id).then((config) => {
      if (cancelled) return
      const merged: Record<string, PaperConfigValue> = {}
      for (const key of Object.keys(DEFAULTS)) {
        merged[key] = config[key] ?? DEFAULTS[key]
      }
      setValues(merged)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [server.id])

  async function handleSave(): Promise<void> {
    setError(null)
    try {
      await window.api.writePaperConfig(server.id, values)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  function set(key: string, value: PaperConfigValue): void {
    setValues((prev) => ({ ...prev, [key]: value }))
  }

  function checkbox(key: string, label: string): React.JSX.Element {
    return (
      <label className="checkbox-label" key={key}>
        <input type="checkbox" checked={values[key] === true} onChange={(e) => set(key, e.target.checked)} />
        {label}
      </label>
    )
  }

  function numberField(key: string, label: string): React.JSX.Element {
    return (
      <label key={key}>
        {label}
        <input
          type="number"
          step="any"
          value={String(values[key] ?? '')}
          onChange={(e) => set(key, e.target.value === '' ? 0 : Number(e.target.value))}
        />
      </label>
    )
  }

  function categoryLabel(key: Category): string {
    switch (key) {
      case 'performance':
        return t('serverHost.paperConfig.categoryPerformance')
      case 'mobs':
        return t('serverHost.paperConfig.categoryMobs')
      case 'gameplay':
        return t('serverHost.paperConfig.categoryGameplay')
      case 'network':
        return t('serverHost.paperConfig.categoryNetwork')
    }
  }

  return (
    <div className="detail-tab">
      <p className="instance-meta">{t('serverHost.paperConfig.explainer')}</p>

      <div className="detail-tab-header">
        <button type="button" onClick={() => setShowRaw((v) => !v)}>
          {showRaw ? t('serverHost.paperConfig.showSettings') : t('serverHost.paperConfig.showRaw')}
        </button>
      </div>

      {showRaw ? (
        <FileConfigBrowser serverId={server.id} rootDir="config" emptyLabel={t('serverHost.paperConfig.empty')} />
      ) : loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : (
        <>
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
            {category === 'performance' && (
              <>
                <div className="field-row">
                  {numberField('chunkSendRate', t('serverHost.paperConfig.chunkSendRate'))}
                  {numberField('chunkLoadRate', t('serverHost.paperConfig.chunkLoadRate'))}
                </div>
                <div className="field-row">
                  {numberField('ioThreads', t('serverHost.paperConfig.ioThreads'))}
                  {numberField('workerThreads', t('serverHost.paperConfig.workerThreads'))}
                </div>
                {numberField('maxAutoSaveChunksPerTick', t('serverHost.paperConfig.maxAutoSaveChunksPerTick'))}
                <div className="field-row">
                  {numberField('tickRateMobSpawner', t('serverHost.paperConfig.tickRateMobSpawner'))}
                  {numberField('tickRateContainerUpdate', t('serverHost.paperConfig.tickRateContainerUpdate'))}
                </div>
              </>
            )}

            {category === 'mobs' && (
              <>
                <p className="instance-meta">{t('serverHost.paperConfig.spawnLimitHint')}</p>
                <div className="field-row">
                  {numberField('spawnLimitMonster', t('serverHost.paperConfig.spawnLimitMonster'))}
                  {numberField('spawnLimitCreature', t('serverHost.paperConfig.spawnLimitCreature'))}
                </div>
                <div className="field-row">
                  {numberField('spawnLimitAmbient', t('serverHost.paperConfig.spawnLimitAmbient'))}
                  {numberField('spawnLimitWaterAmbient', t('serverHost.paperConfig.spawnLimitWaterAmbient'))}
                </div>
                {numberField('maxEntityCollisions', t('serverHost.paperConfig.maxEntityCollisions'))}
                {checkbox('antiXrayEnabled', t('serverHost.paperConfig.antiXrayEnabled'))}
                {numberField('antiXrayEngineMode', t('serverHost.paperConfig.antiXrayEngineMode'))}
              </>
            )}

            {category === 'gameplay' && (
              <>
                {checkbox('disableExplosionKnockback', t('serverHost.paperConfig.disableExplosionKnockback'))}
                {checkbox('disableIceAndSnow', t('serverHost.paperConfig.disableIceAndSnow'))}
                {checkbox('disableThunder', t('serverHost.paperConfig.disableThunder'))}
                {checkbox('hopperCooldownWhenFull', t('serverHost.paperConfig.hopperCooldownWhenFull'))}
                {checkbox('hopperIgnoreOccludingBlocks', t('serverHost.paperConfig.hopperIgnoreOccludingBlocks'))}
                {checkbox('lootablesAutoReplenish', t('serverHost.paperConfig.lootablesAutoReplenish'))}
                <label>
                  {t('serverHost.paperConfig.redstoneImplementation')}
                  <select
                    value={String(values.redstoneImplementation ?? 'VANILLA')}
                    onChange={(e) => set('redstoneImplementation', e.target.value)}
                  >
                    <option value="VANILLA">VANILLA</option>
                    <option value="EIGENCRAFT">EIGENCRAFT</option>
                    <option value="ALTERNATE_CURRENT">ALTERNATE_CURRENT</option>
                  </select>
                </label>
                <div className="field-row">
                  {numberField('fishingTimeMin', t('serverHost.paperConfig.fishingTimeMin'))}
                  {numberField('fishingTimeMax', t('serverHost.paperConfig.fishingTimeMax'))}
                </div>
              </>
            )}

            {category === 'network' && (
              <>
                {checkbox('velocityEnabled', t('serverHost.paperConfig.velocityEnabled'))}
                {checkbox('velocityOnlineMode', t('serverHost.paperConfig.velocityOnlineMode'))}
                <label>
                  {t('serverHost.paperConfig.velocitySecret')}
                  <input
                    value={String(values.velocitySecret ?? '')}
                    onChange={(e) => set('velocitySecret', e.target.value)}
                  />
                </label>
                {checkbox('bungeeCordOnlineMode', t('serverHost.paperConfig.bungeeCordOnlineMode'))}
                {checkbox('updateCheckerEnabled', t('serverHost.paperConfig.updateCheckerEnabled'))}
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

export default ServerPaperConfigTab
