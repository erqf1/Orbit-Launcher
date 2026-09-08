import { useState } from 'react'
import VersionLoaderFields from '../VersionLoaderFields'
import type { Instance, LoaderType, ModMigrationResult } from '../types'

interface Props {
  instance: Instance
  onChanged: () => void
}

function VersionTab({ instance, onChanged }: Props): React.JSX.Element {
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
        setMigrationStatus('Suche passende Mod-Versionen für die neue Version…')
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
      <section>
        <h3>Aktuelle Version</h3>
        <p className="instance-meta">
          {instance.mcVersion}
          {instance.loader !== 'vanilla' && ` · ${instance.loader}`}
          {instance.loaderVersion && ` ${instance.loaderVersion}`}
        </p>
        {!changing && (
          <button type="button" onClick={startChanging}>
            Version ändern…
          </button>
        )}
      </section>

      {changing && (
        <section>
          <h3>Neue Version wählen</h3>
          <p className="instance-meta">
            Ändert diese Instanz direkt (keine Kopie). Danach wird versucht, jeden installierten Mod für
            die neue Version/den neuen Loader neu aufzulösen - Mods ohne passende Version werden dir
            danach aufgelistet.
          </p>
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
              Abbrechen
            </button>
            <button type="button" onClick={handleApply} disabled={!canApply}>
              {applying ? 'Wende an…' : 'Übernehmen'}
            </button>
          </div>
        </section>
      )}

      {migrationStatus && (
        <section>
          <p className="instance-meta">{migrationStatus}</p>
        </section>
      )}

      {migrationResult && (
        <section>
          <h3>Mod-Migration</h3>
          {migrationResult.migrated.length > 0 && (
            <>
              <p className="instance-meta">
                {migrationResult.migrated.length} Mod(s) erfolgreich auf die neue Version aktualisiert:
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
              <p className="error">
                {migrationResult.failed.length} Mod(s) konnten nicht übernommen werden - manuell prüfen:
              </p>
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
            <p className="instance-meta">Keine aktivierten Mods zum Migrieren gefunden.</p>
          )}
        </section>
      )}
    </div>
  )
}

export default VersionTab
