import { useEffect, useState } from 'react'
import { useLocale } from './i18n'
import { useMinecraftVersions, useLoaderVersions } from './useVersionPicker'
import { usePaperVersions, usePaperBuilds } from './useServerVersionPicker'
import type { ServerLoaderType } from './types'

interface Props {
  onCancel: () => void
  onCreate: (
    name: string,
    mcVersion: string,
    loader: ServerLoaderType,
    fabricLoaderVersion: string | undefined,
    paperBuildId: number | undefined
  ) => Promise<void>
}

// One growing single-shot modal rather than a multi-step wizard, same
// precedent as CreateInstanceDialog - a `loader` select progressively
// reveals exactly the extra field each server type actually needs: nothing
// for Vanilla, a loader-version picker for Fabric (reusing the exact same
// useLoaderVersions hook the client dialog uses - server-side Fabric loader
// versions are the identical list), a build picker defaulted to "latest"
// for Paper.
function CreateServerDialog({ onCancel, onCreate }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [name, setName] = useState(t('createServer.defaultName'))
  const [loader, setLoader] = useState<ServerLoaderType>('vanilla')
  const [mcVersion, setMcVersion] = useState('')
  const [fabricLoaderVersion, setFabricLoaderVersion] = useState('')
  const [paperBuildId, setPaperBuildId] = useState<number | ''>('')
  const [showBuildPicker, setShowBuildPicker] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const { versions: mcVersions, loading: loadingMcVersions } = useMinecraftVersions()
  const releaseVersions = mcVersions.filter((v) => v.type === 'release')
  const { loaderVersions: fabricLoaderVersions, loading: loadingFabricVersions } = useLoaderVersions(
    'fabric',
    loader === 'fabric' ? mcVersion : ''
  )
  const { versions: paperVersions, loading: loadingPaperVersions } = usePaperVersions()
  const { builds: paperBuilds, loading: loadingPaperBuilds } = usePaperBuilds(
    loader === 'paper' ? mcVersion : ''
  )

  // Reset the version whenever the loader type changes - Vanilla/Fabric and
  // Paper draw from two different version lists (the full Mojang manifest
  // vs. only versions Paper has actually built for), so a version valid for
  // one is very likely not valid for the other.
  useEffect(() => {
    setMcVersion('')
    setFabricLoaderVersion('')
    setPaperBuildId('')
    setShowBuildPicker(false)
  }, [loader])

  useEffect(() => {
    if (loader === 'paper') return
    if (!loadingMcVersions && releaseVersions.length > 0 && !mcVersion) {
      setMcVersion(releaseVersions[0].id)
    }
  }, [loader, loadingMcVersions, releaseVersions, mcVersion])

  useEffect(() => {
    if (loader !== 'paper') return
    if (!loadingPaperVersions && paperVersions.length > 0 && !mcVersion) {
      setMcVersion(paperVersions[0])
    }
  }, [loader, loadingPaperVersions, paperVersions, mcVersion])

  useEffect(() => {
    if (loader !== 'fabric') return
    if (!loadingFabricVersions && fabricLoaderVersions.length > 0 && !fabricLoaderVersion) {
      setFabricLoaderVersion(fabricLoaderVersions[0].version)
    }
  }, [loader, loadingFabricVersions, fabricLoaderVersions, fabricLoaderVersion])

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !mcVersion) return
    if (loader === 'fabric' && !fabricLoaderVersion) return
    setError(null)
    setSubmitting(true)
    try {
      await onCreate(
        name.trim(),
        mcVersion,
        loader,
        loader === 'fabric' ? fabricLoaderVersion : undefined,
        loader === 'paper' && paperBuildId !== '' ? paperBuildId : undefined
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    !submitting && !!mcVersion && (loader !== 'fabric' || !!fabricLoaderVersion)

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{t('createServer.title')}</h2>

        <label>
          {t('createServer.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <label>
          {t('createServer.type')}
          <select value={loader} onChange={(e) => setLoader(e.target.value as ServerLoaderType)}>
            <option value="vanilla">Vanilla</option>
            <option value="fabric">Fabric</option>
            <option value="paper">Paper</option>
          </select>
        </label>

        {loader === 'paper' ? (
          <label>
            {t('createServer.mcVersion')}
            {loadingPaperVersions ? (
              <p>{t('createServer.loadingVersions')}</p>
            ) : (
              <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
                {paperVersions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </label>
        ) : (
          <label>
            {t('createServer.mcVersion')}
            {loadingMcVersions ? (
              <p>{t('createServer.loadingVersions')}</p>
            ) : (
              <select value={mcVersion} onChange={(e) => setMcVersion(e.target.value)}>
                {releaseVersions.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        {loader === 'fabric' && (
          <label>
            {t('createServer.loaderVersion')}
            {loadingFabricVersions ? (
              <p>{t('createServer.loadingVersions')}</p>
            ) : fabricLoaderVersions.length === 0 ? (
              <p>{t('createServer.noLoaderVersion')}</p>
            ) : (
              <select value={fabricLoaderVersion} onChange={(e) => setFabricLoaderVersion(e.target.value)}>
                {fabricLoaderVersions.map((v) => (
                  <option key={v.version} value={v.version}>
                    {v.version}
                    {v.stable ? '' : ' (unstable)'}
                  </option>
                ))}
              </select>
            )}
          </label>
        )}

        {loader === 'paper' && (
          <>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={showBuildPicker}
                onChange={(e) => setShowBuildPicker(e.target.checked)}
              />
              {t('createServer.pickSpecificBuild')}
            </label>
            {showBuildPicker && (
              <label>
                {t('createServer.build')}
                {loadingPaperBuilds ? (
                  <p>{t('createServer.loadingVersions')}</p>
                ) : (
                  <select
                    value={paperBuildId}
                    onChange={(e) => setPaperBuildId(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">{t('createServer.latestBuild')}</option>
                    {paperBuilds.map((b) => (
                      <option key={b.id} value={b.id}>
                        #{b.id} ({b.channel})
                      </option>
                    ))}
                  </select>
                )}
              </label>
            )}
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={!canSubmit}>
            {submitting ? t('createServer.creating') : t('common.create')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateServerDialog
