import { useState } from 'react'
import VersionLoaderFields from '../VersionLoaderFields'
import { useLocale } from '../i18n'
import type { Instance, LoaderType, ModMigrationResult } from '../types'

interface Props {
  instance: Instance
  onChanged: () => void
}

const LOADER_LABELS: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  legacyfabric: 'Legacy Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

function VersionTab({ instance, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [changing, setChanging] = useState(false)
  const [mcVersion, setMcVersion] = useState(instance.mcVersion)
  const [loader, setLoader] = useState<LoaderType>(instance.loader)
  const [loaderVersion, setLoaderVersion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [applying, setApplying] = useState(false)
  const [migrationStatus, setMigrationStatus] = useState<string | null>(null)
  const [migrationResult, setMigrationResult] = useState<ModMigrationResult | null>(null)

  function startChanging(): void {
    setMcVersion(instance.mcVersion)
    setLoader(instance.loader)
    setLoaderVersion('')
    setMigrationResult(null)
    setMigrationStatus(null)
    setError(null)
    setChanging(true)
  }

  async function handleApply(): Promise<void> {
    if (!mcVersion) return
    if (loader !== 'vanilla' && !loaderVersion) return
    setError(null)
    setApplying(true)
    setMigrationResult(null)
    try {
      await window.api.changeInstanceVersion(instance.id, {
        mcVersion,
        loader,
        loaderVersion: loader === 'vanilla' ? undefined : loaderVersion
      })
      setChanging(false)
      onChanged()

      if (loader !== 'vanilla') {
        setMigrationStatus(t('version.migratingStatus'))
        const result = await window.api.migrateMods(instance.id, mcVersion, loader)
        setMigrationResult(result)
      }
      setMigrationStatus(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  const canApply = !applying && !!mcVersion && (loader === 'vanilla' || !!loaderVersion)

  return (
    <div className="detail-tab">
      <section className="settings-section">
        <h4 className="settings-section-title">{t('version.currentVersionTitle')}</h4>
        <div className="instance-tags">
          <span className="pill pill-version">{instance.mcVersion}</span>
          {instance.loader !== 'vanilla' && (
            <span className={`pill pill-${instance.loader}`}>{LOADER_LABELS[instance.loader]}</span>
          )}
          {instance.loaderVersion && <span className="pill pill-version">{instance.loaderVersion}</span>}
        </div>
        {!changing && (
          <button type="button" className="save-button" onClick={startChanging}>
            {t('version.changeVersion')}
          </button>
        )}
      </section>

      {changing && (
        <section className="settings-section">
          <h4 className="settings-section-title">{t('version.chooseNewVersionTitle')}</h4>
          <p className="instance-meta">{t('version.changeDescription')}</p>
          <VersionLoaderFields
            mcVersion={mcVersion}
            onMcVersionChange={setMcVersion}
            loader={loader}
            onLoaderChange={setLoader}
            loaderVersion={loaderVersion}
            onLoaderVersionChange={setLoaderVersion}
            onError={setError}
          />
          {error && <p className="error">{error}</p>}
          <div className="modal-actions">
            <button type="button" onClick={() => setChanging(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="save-button" onClick={handleApply} disabled={!canApply}>
              {applying ? t('version.applying') : t('version.apply')}
            </button>
          </div>
        </section>
      )}

      {migrationStatus && (
        <section className="settings-section">
          <p className="instance-meta">{migrationStatus}</p>
        </section>
      )}

      {migrationResult && (
        <section className="settings-section">
          <h4 className="settings-section-title">{t('version.migrationTitle')}</h4>
          {migrationResult.migrated.length > 0 && (
            <>
              <p className="instance-meta">
                {t('version.migratedCount', { count: migrationResult.migrated.length })}
              </p>
              <ul className="mod-list">
                {migrationResult.migrated.map((m) => (
                  <li key={m.oldFilename}>
                    <span>{m.title}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {migrationResult.failed.length > 0 && (
            <>
              <p className="error">{t('version.failedCount', { count: migrationResult.failed.length })}</p>
              <ul className="mod-list">
                {migrationResult.failed.map((m) => (
                  <li key={m.oldFilename}>
                    <span>{m.title ?? m.oldFilename}</span>
                    <span className="instance-meta">{m.reason}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {migrationResult.migrated.length === 0 && migrationResult.failed.length === 0 && (
            <p className="instance-meta">{t('version.noModsToMigrate')}</p>
          )}
        </section>
      )}
    </div>
  )
}

export default VersionTab
