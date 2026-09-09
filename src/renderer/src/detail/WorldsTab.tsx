import { useCallback, useEffect, useState } from 'react'
import { INTL_LOCALE, useLocale } from '../i18n'
import type { WorldEntry } from '../types'

interface Props {
  instanceId: string
}

function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function WorldsTab({ instanceId }: Props): React.JSX.Element {
  const { t, locale } = useLocale()
  const [worlds, setWorlds] = useState<WorldEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listWorlds(instanceId)
      .then(setWorlds)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [instanceId])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleDelete(name: string): Promise<void> {
    if (!window.confirm(t('worlds.confirmDelete', { name }))) return
    await window.api.deleteWorld(instanceId, name)
    refresh()
  }

  async function confirmRename(): Promise<void> {
    if (renaming && renameDraft.trim() && renameDraft.trim() !== renaming) {
      await window.api.renameWorld(instanceId, renaming, renameDraft.trim())
      refresh()
    }
    setRenaming(null)
  }

  return (
    <div className="detail-tab">
      <div className="detail-tab-header">
        <button type="button" onClick={() => window.api.openWorldsFolder(instanceId)}>
          {t('common.openFolder')}
        </button>
      </div>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : worlds.length === 0 ? (
        <p className="instance-meta">{t('worlds.empty')}</p>
      ) : (
        <ul className="mod-list">
          {worlds.map((w) => (
            <li key={w.folderName}>
              {renaming === w.folderName ? (
                <input
                  className="rename-input"
                  autoFocus
                  value={renameDraft}
                  onChange={(e) => setRenameDraft(e.target.value)}
                  onBlur={confirmRename}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') confirmRename()
                    if (e.key === 'Escape') setRenaming(null)
                  }}
                />
              ) : (
                <span>
                  {t('worlds.rowInfo', {
                    folderName: w.folderName,
                    size: formatSize(w.sizeBytes),
                    date: new Date(w.lastPlayed).toLocaleString(INTL_LOCALE[locale])
                  })}
                </span>
              )}
              <span className="detail-row-actions">
                <button
                  type="button"
                  onClick={() => {
                    setRenaming(w.folderName)
                    setRenameDraft(w.folderName)
                  }}
                >
                  {t('worlds.rename')}
                </button>
                <button type="button" onClick={() => handleDelete(w.folderName)}>
                  {t('common.delete')}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default WorldsTab
