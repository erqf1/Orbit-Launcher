import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { LogFileEntry } from '../types'

interface Props {
  instanceId: string
}

function LogsTab({ instanceId }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [files, setFiles] = useState<LogFileEntry[]>([])
  const [selected, setSelected] = useState<LogFileEntry | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listLogFiles(instanceId)
      .then(setFiles)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [instanceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function open(file: LogFileEntry): Promise<void> {
    setSelected(file)
    setError(null)
    try {
      const text = await window.api.readLogFile(instanceId, file.folder, file.name)
      setContent(text)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="detail-tab detail-tab-logs">
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : files.length === 0 ? (
        <p className="instance-meta">{t('logs.empty')}</p>
      ) : (
        <>
          <select
            value={selected ? `${selected.folder}/${selected.name}` : ''}
            onChange={(e) => {
              const found = files.find((f) => `${f.folder}/${f.name}` === e.target.value)
              if (found) open(found)
            }}
          >
            <option value="">{t('logs.chooseFile')}</option>
            {files.map((f) => (
              <option key={`${f.folder}/${f.name}`} value={`${f.folder}/${f.name}`}>
                {f.folder}/{f.name}
              </option>
            ))}
          </select>
          {selected && <pre className="log log-viewer">{content}</pre>}
        </>
      )}
    </div>
  )
}

export default LogsTab
