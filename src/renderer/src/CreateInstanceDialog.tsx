import { useState } from 'react'
import VersionLoaderFields from './VersionLoaderFields'
import { useLocale } from './i18n'
import type { LoaderType } from './types'

interface Props {
  onCancel: () => void
  onCreate: (
    name: string,
    mcVersion: string,
    loader: LoaderType,
    loaderVersion: string | undefined,
    installRecommendedMods: boolean
  ) => Promise<void>
  // Set when opened while the sidebar is filtered to a specific version -
  // the version picker is then replaced by a fixed display for that version
  // instead of offering every Minecraft version again.
  presetVersion?: string
}

function CreateInstanceDialog({ onCancel, onCreate, presetVersion }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [name, setName] = useState(t('createInstance.defaultName'))
  const [mcVersion, setMcVersion] = useState(presetVersion ?? '')
  const [loader, setLoader] = useState<LoaderType>('vanilla')
  const [loaderVersion, setLoaderVersion] = useState('')
  const [installRecommendedMods, setInstallRecommendedMods] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!name.trim() || !mcVersion) return
    if (loader !== 'vanilla' && !loaderVersion) return
    setError(null)
    setSubmitting(true)
    try {
      await onCreate(
        name.trim(),
        mcVersion,
        loader,
        loader === 'vanilla' ? undefined : loaderVersion,
        loader !== 'vanilla' && installRecommendedMods
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit =
    !submitting && !!mcVersion && (loader === 'vanilla' || !!loaderVersion)

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{t('createInstance.title')}</h2>

        <label>
          {t('createInstance.name')}
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>

        <VersionLoaderFields
          mcVersion={mcVersion}
          onMcVersionChange={setMcVersion}
          loader={loader}
          onLoaderChange={setLoader}
          loaderVersion={loaderVersion}
          onLoaderVersionChange={setLoaderVersion}
          onError={setError}
          lockedVersion={presetVersion}
        />

        {loader !== 'vanilla' && (
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={installRecommendedMods}
              onChange={(e) => setInstallRecommendedMods(e.target.checked)}
            />
            {t('createInstance.installRecommendedMods')}
          </label>
        )}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={!canSubmit}>
            {submitting ? t('createInstance.creating') : t('common.create')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CreateInstanceDialog
