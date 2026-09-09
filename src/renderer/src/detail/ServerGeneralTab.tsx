import { useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { JavaInstallation, ServerInstance, ServerSettingsPatch } from '../types'

interface Props {
  server: ServerInstance
  onSaved: () => void
}

function ServerGeneralTab({ server, onSaved }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [javaOptions, setJavaOptions] = useState<JavaInstallation[]>([])
  const [loadingJava, setLoadingJava] = useState(true)
  const [javaPath, setJavaPath] = useState(server.javaPath ?? '')
  const [memoryMin, setMemoryMin] = useState(server.memoryMin)
  const [memoryMax, setMemoryMax] = useState(server.memoryMax)
  const [jvmArgs, setJvmArgs] = useState(server.jvmArgs ?? '')
  const [serverPort, setServerPort] = useState(String(server.serverPort))
  const [browsingJava, setBrowsingJava] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  async function handleBrowseJava(): Promise<void> {
    setBrowsingJava(true)
    try {
      const result = await window.api.browseForJava()
      if (result) {
        setJavaPath(result.path)
        setJavaOptions((prev) => (prev.some((j) => j.path === result.path) ? prev : [...prev, result]))
      }
    } finally {
      setBrowsingJava(false)
    }
  }

  const memoryPattern = /^\d+[MG]$/i
  const toMebibytes = (value: string): number => {
    const match = value.match(memoryPattern)
    if (!match) return NaN
    const amount = Number(value.slice(0, -1))
    return value.at(-1)?.toUpperCase() === 'G' ? amount * 1024 : amount
  }
  const memoryValid =
    memoryPattern.test(memoryMin) && memoryPattern.test(memoryMax) && toMebibytes(memoryMin) <= toMebibytes(memoryMax)
  const portValid = /^\d+$/.test(serverPort) && Number(serverPort) > 0 && Number(serverPort) < 65536

  async function handleSave(): Promise<void> {
    if (!memoryValid || !portValid) return
    setError(null)
    const patch: ServerSettingsPatch = {
      javaPath: javaPath || null,
      memoryMin,
      memoryMax,
      jvmArgs: jvmArgs.trim() || null,
      serverPort: Number(serverPort)
    }
    try {
      await window.api.updateHostedServerSettings(server.id, patch)
      onSaved()
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="detail-tab">
      <section className="settings-section">
        <h4 className="settings-section-title">{t('serverHost.general.network')}</h4>
        <label>
          {t('serverHost.general.port')}
          <input value={serverPort} onChange={(e) => setServerPort(e.target.value)} placeholder="25565" />
        </label>
        {!portValid && <p className="error">{t('serverHost.general.portInvalid')}</p>}
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.javaAndMemory')}</h4>
        <label>
          {t('settings.javaInstallation')}
          {loadingJava ? (
            <p className="instance-meta">{t('common.loading')}</p>
          ) : (
            <select value={javaPath} onChange={(e) => setJavaPath(e.target.value)}>
              <option value="">{t('serverHost.general.systemDefaultJava')}</option>
              {javaOptions.map((j) => (
                <option key={j.path} value={j.path}>
                  {j.version} — {j.path}
                </option>
              ))}
            </select>
          )}
        </label>
        <button type="button" onClick={handleBrowseJava} disabled={browsingJava}>
          {browsingJava ? '…' : t('settings.browse')}
        </button>

        <div className="field-row">
          <label>
            {t('settings.memoryMin')}
            <input value={memoryMin} onChange={(e) => setMemoryMin(e.target.value)} placeholder="1G" />
          </label>
          <label>
            {t('settings.memoryMax')}
            <input value={memoryMax} onChange={(e) => setMemoryMax(e.target.value)} placeholder="4G" />
          </label>
        </div>
        {!memoryValid && <p className="error">{t('serverHost.general.memoryInvalid')}</p>}

        <label>
          {t('settings.jvmArgs')}
          <input value={jvmArgs} onChange={(e) => setJvmArgs(e.target.value)} placeholder="z.B. -XX:+UseG1GC" />
        </label>
      </section>

      {error && <p className="error">{error}</p>}
      <div className="modal-actions">
        <button
          type="button"
          className="save-button"
          onClick={handleSave}
          disabled={!memoryValid || !portValid}
        >
          {t('common.save')}
        </button>
        {saved && <span className="instance-meta">{t('common.saved')}</span>}
      </div>
    </div>
  )
}

export default ServerGeneralTab
