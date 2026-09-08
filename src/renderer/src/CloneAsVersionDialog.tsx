import { useState } from 'react'
import VersionLoaderFields from './VersionLoaderFields'
import type { CloneContentOptions, Instance, LoaderType } from './types'

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

const CONTENT_OPTION_LABELS: Array<{ key: keyof CloneContentOptions; label: string }> = [
  { key: 'mods', label: 'Mods' },
  { key: 'worlds', label: 'Welten' },
  { key: 'resourcepacks', label: 'Resource Packs' },
  { key: 'shaderpacks', label: 'Shader Packs' },
  { key: 'screenshots', label: 'Screenshots' },
  { key: 'servers', label: 'Server-Liste' },
  { key: 'settings', label: 'Einstellungen (Speicher, Java, Fenster, Notizen)' }
]

// The dialog always shows for every duplicate (not just version changes) -
// version/loader default to the source's own, so leaving them untouched and
// submitting is just a plain same-version duplicate; changing them routes to
// the version-migration flow instead. Either way the caller decides which
// backend call to make based on whether those fields actually changed.
function CloneAsVersionDialog({ instance, onCancel, onClone }: Props): React.JSX.Element {
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
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>"{instance.name}" duplizieren</h2>
        <p className="instance-meta">
          Standardmäßig wird die gleiche Version/Loader verwendet. Bei einer anderen Version wird der
          Loader für die neue Instanz neu installiert.
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

        <div className="settings-section-title">Was übernommen werden soll</div>
        {CONTENT_OPTION_LABELS.map(({ key, label }) => (
          <label className="checkbox-label" key={key}>
            <input type="checkbox" checked={content[key]} onChange={() => toggleContent(key)} />
            {label}
          </label>
        ))}

        {error && <p className="error">{error}</p>}

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" disabled={!canSubmit}>
            {submitting ? 'Dupliziere…' : 'Duplizieren'}
          </button>
        </div>
      </form>
    </div>
  )
}

export default CloneAsVersionDialog
