import { useEffect, useState } from 'react'
import type { Instance, InstanceSettingsPatch, JavaInstallation } from './types'

interface Props {
  instance: Instance
  onCancel: () => void
  onSave: (id: string, patch: InstanceSettingsPatch) => void
}

function InstanceSettingsDialog({ instance, onCancel, onSave }: Props): React.JSX.Element {
  const [javaOptions, setJavaOptions] = useState<JavaInstallation[]>([])
  const [loadingJava, setLoadingJava] = useState(true)
  const [javaPath, setJavaPath] = useState(instance.javaPath ?? '')
  const [memoryMin, setMemoryMin] = useState(instance.memoryMin)
  const [memoryMax, setMemoryMax] = useState(instance.memoryMax)
  const [windowWidth, setWindowWidth] = useState(instance.windowWidth?.toString() ?? '')
  const [windowHeight, setWindowHeight] = useState(instance.windowHeight?.toString() ?? '')

  useEffect(() => {
    let cancelled = false
    window.api
      .detectJava()
      .then((list) => {
        if (!cancelled) setJavaOptions(list)
      })
      .finally(() => {
        if (!cancelled) setLoadingJava(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const memoryPattern = /^\d+[MG]$/i
  const toMebibytes = (value: string): number => {
    const match = value.match(memoryPattern)
    if (!match) return NaN
    const amount = Number(value.slice(0, -1))
    return value.at(-1)?.toUpperCase() === 'G' ? amount * 1024 : amount
  }
  const memoryValid =
    memoryPattern.test(memoryMin) &&
    memoryPattern.test(memoryMax) &&
    toMebibytes(memoryMin) <= toMebibytes(memoryMax)

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (!memoryValid) return
    onSave(instance.id, {
      javaPath: javaPath || null,
      memoryMin,
      memoryMax,
      windowWidth: windowWidth ? Number(windowWidth) : null,
      windowHeight: windowHeight ? Number(windowHeight) : null
    })
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Einstellungen: {instance.name}</h2>

        <label>
          Java
          {loadingJava ? (
            <p>Suche Java-Installationen…</p>
          ) : (
            <select value={javaPath} onChange={(e) => setJavaPath(e.target.value)}>
              <option value="">System-Standard (java)</option>
              {javaOptions.map((j) => (
                <option key={j.path} value={j.path}>
                  {j.version} — {j.path}
                </option>
              ))}
            </select>
          )}
        </label>

        <div className="field-row">
          <label>
            Min. Speicher
            <input value={memoryMin} onChange={(e) => setMemoryMin(e.target.value)} placeholder="2G" />
          </label>
          <label>
            Max. Speicher
            <input value={memoryMax} onChange={(e) => setMemoryMax(e.target.value)} placeholder="4G" />
          </label>
        </div>

        {!memoryValid && (
          <p className="error">
            Speicher als Zahl + M oder G angeben (z.B. 2G oder 2048M), Minimum darf Maximum nicht
            überschreiten.
          </p>
        )}

        <div className="field-row">
          <label>
            Fensterbreite
            <input
              type="number"
              value={windowWidth}
              onChange={(e) => setWindowWidth(e.target.value)}
              placeholder="Standard"
            />
          </label>
          <label>
            Fensterhöhe
            <input
              type="number"
              value={windowHeight}
              onChange={(e) => setWindowHeight(e.target.value)}
              placeholder="Standard"
            />
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Abbrechen
          </button>
          <button type="submit" disabled={!memoryValid}>
            Speichern
          </button>
        </div>
      </form>
    </div>
  )
}

export default InstanceSettingsDialog
