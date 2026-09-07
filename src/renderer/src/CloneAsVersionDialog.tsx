import { useState } from 'react'
import VersionLoaderFields from './VersionLoaderFields'
import type { Instance, LoaderType } from './types'

interface Props {
  instance: Instance
  onCancel: () => void
  onClone: (
    id: string,
    mcVersion: string,
    loader: LoaderType,
    loaderVersion?: string
  ) => Promise<void>
}

// Duplicates an instance's files/settings but targets a different Minecraft
// version (and, if desired, a different loader) - useful for e.g. moving a
// modded instance forward to a new release without losing the old one.
function CloneAsVersionDialog({ instance, onCancel, onClone }: Props): React.JSX.Element {
  const [mcVersion, setMcVersion] = useState(instance.mcVersion)
  const [loader, setLoader] = useState<LoaderType>(instance.loader)
  const [loaderVersion, setLoaderVersion] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!mcVersion) return
    if (loader !== 'vanilla' && !loaderVersion) return
    setError(null)
    setSubmitting(true)
    try {
      await onClone(instance.id, mcVersion, loader, loader === 'vanilla' ? undefined : loaderVersion)
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
        <h2>"{instance.name}" duplizieren als…</h2>
        <p className="instance-meta">
          Mods, Welten und Einstellungen werden übernommen; der Loader wird für die neue Version neu
          installiert.
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
