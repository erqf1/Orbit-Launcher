import { useState } from 'react'
import VersionLoaderFields from './VersionLoaderFields'
import { useLocale } from './i18n'
import type { TranslationKey } from './i18n/en'
import type { CloneContentOptions, Instance, LoaderType } from './types'
import { useBackdropClose } from './useBackdropClose'

interface Props {
  instance: Instance
  onCancel: () => void
  onClone: (
    id: string,
    mcVersion: string,
    loader: LoaderType,
    loaderVersion: string | undefined,
    contentOptions: CloneContentOptions
  ) => Promise<void>
}

const CONTENT_OPTION_LABELS: Array<{ key: keyof CloneContentOptions; labelKey: TranslationKey }> = [
  { key: 'mods', labelKey: 'cloneDialog.content.mods' },
  { key: 'worlds', labelKey: 'cloneDialog.content.worlds' },
  { key: 'resourcepacks', labelKey: 'cloneDialog.content.resourcepacks' },
  { key: 'shaderpacks', labelKey: 'cloneDialog.content.shaderpacks' },
  { key: 'screenshots', labelKey: 'cloneDialog.content.screenshots' },
  { key: 'servers', labelKey: 'cloneDialog.content.servers' },
  { key: 'settings', labelKey: 'cloneDialog.content.settings' }
]

// The dialog always shows for every duplicate (not just version changes) -
// version/loader default to the source's own, so leaving them untouched and
// submitting is just a plain same-version duplicate; changing them routes to
// the version-migration flow instead. Either way the caller decides which
// backend call to make based on whether those fields actually changed.
function CloneAsVersionDialog({ instance, onCancel, onClone }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [mcVersion, setMcVersion] = useState(instance.mcVersion)
  const [loader, setLoader] = useState<LoaderType>(instance.loader)
  const [loaderVersion, setLoaderVersion] = useState('')
  const [content, setContent] = useState<CloneContentOptions>({
    mods: true,
    worlds: true,
    resourcepacks: true,
    shaderpacks: true,
    screenshots: true,
    servers: true,
    settings: true
  })
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function toggleContent(key: keyof CloneContentOptions): void {
    setContent((c) => ({ ...c, [key]: !c[key] }))
  }

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!mcVersion) return
    if (loader !== 'vanilla' && !loaderVersion) return
    setError(null)
    setSubmitting(true)
    try {
      await onClone(instance.id, mcVersion, loader, loader === 'vanilla' ? undefined : loaderVersion, content)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !submitting && !!mcVersion && (loader === 'vanilla' || !!loaderVersion)

  return (
    <div className="modal-backdrop" {...useBackdropClose(onCancel)}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>{t('cloneDialog.title', { name: instance.name })}</h2>
        <p className="instance-meta">{t('cloneDialog.description')}</p>

        <VersionLoaderFields
          mcVersion={mcVersion}
          onMcVersionChange={setMcVersion}
          loader={loader}
          onLoaderChange={setLoader}
          loaderVersion={loaderVersion}
          onLoaderVersionChange={setLoaderVersion}
          onError={setError}
        />

        <div className="settings-section-title">{t('cloneDialog.contentSectionTitle')}</div>
        {CONTENT_OPTION_LABELS.map(({ key, labelKey }) => (
          <label className="checkbox-label" key={key}>
            <input type="checkbox" checked={content[key]} onChange={() => toggleContent(key)} />
            {t(labelKey)}
          </label>
        ))}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="submit" disabled={!canSubmit}>
            {submitting ? t('cloneDialog.duplicating') : t('cloneDialog.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CloneAsVersionDialog
