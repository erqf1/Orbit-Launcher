import { useState } from 'react'
import { useLocale } from './i18n'
import type { CrashDiagnosis, Instance } from './types'

interface Props {
  instance: Instance
  diagnosis: CrashDiagnosis
  onFixed: () => void
}

// Shown under a launch's log once it exits non-zero and main.ts's
// crashDiagnosis.ts has scanned the log for a small set of known signatures
// (see that file for the exact scope - deliberately bounded, not general
// crash-report parsing). Follows this codebase's existing confirm-before-
// apply convention (a window.confirm listing exactly what will change,
// same as ModBrowserDialog.tsx's dependency-install confirms) rather than a
// custom modal, so nothing is ever silently installed/changed.
function CrashDiagnosisBanner({ instance, diagnosis, onFixed }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [applying, setApplying] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (diagnosis.kind === 'unknown') {
    return <p className="instance-meta crash-diagnosis">{t('crash.unknown')}</p>
  }

  let message: string
  let confirmText: string
  let canFix: boolean

  if (diagnosis.kind === 'oom') {
    message = t('crash.oom.message')
    confirmText = t('crash.oom.confirm', {
      current: diagnosis.currentMemoryMax,
      suggested: diagnosis.suggestedMemoryMax
    })
    canFix = true
  } else if (diagnosis.kind === 'javaMismatch') {
    message = t('crash.javaMismatch.message', {
      installed: diagnosis.installedMajor !== null ? String(diagnosis.installedMajor) : '?',
      required: String(diagnosis.requiredMajor)
    })
    canFix = diagnosis.suggestedJavaPath !== null
    confirmText = canFix ? t('crash.javaMismatch.confirm', { path: diagnosis.suggestedJavaPath as string }) : ''
  } else {
    message = t('crash.missingDependency.message', {
      mod: diagnosis.modTitle,
      dependency: diagnosis.missingDepTitle
    })
    confirmText = t('crash.missingDependency.confirm', { dependency: diagnosis.missingDepTitle })
    canFix = true
  }

  async function handleFix(): Promise<void> {
    if (!window.confirm(confirmText)) return
    setError(null)
    setApplying(true)
    try {
      if (diagnosis.kind === 'oom') {
        await window.api.updateInstanceSettings(instance.id, { memoryMax: diagnosis.suggestedMemoryMax })
      } else if (diagnosis.kind === 'javaMismatch' && diagnosis.suggestedJavaPath) {
        await window.api.updateInstanceSettings(instance.id, { javaPath: diagnosis.suggestedJavaPath })
      } else if (diagnosis.kind === 'missingDependency') {
        const versions = await window.api.listModVersions(
          diagnosis.missingDepProjectId,
          instance.mcVersion,
          instance.loader
        )
        const best = versions[0]
        if (!best) throw new Error(t('mods.noMatchingVersion'))
        await window.api.installMod(instance.id, { url: best.url, filename: best.filename })
      }
      onFixed()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="crash-diagnosis">
      <p className="instance-meta">{message}</p>
      {error && <p className="error">{error}</p>}
      {canFix && (
        <button type="button" className="save-button" onClick={handleFix} disabled={applying}>
          {applying ? t('crash.fixing') : t('crash.fixIt')}
        </button>
      )}
    </div>
  )
}

export default CrashDiagnosisBanner
