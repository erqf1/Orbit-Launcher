import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { ServerFileEntry } from '../types'

interface Props {
  serverId: string
  // The folder this browser is scoped to and can't navigate above -
  // 'config' for Paper's global config, 'plugins/<name>' for one plugin's
  // own folder. Text-file browsing/editing (not a generic file manager -
  // matches what this is actually needed for, see the two tabs that use it.
  rootDir: string
  emptyLabel: string
}

// Shared by ServerPaperConfigTab (rootDir='config') and the per-plugin
// config browser in ServerPluginsTab (rootDir='plugins/<name>') - both are
// really the same need ("browse and edit this server's own text files"),
// just scoped to a different folder, so this is written once rather than
// as two narrower, near-duplicate features.
function FileConfigBrowser({ serverId, rootDir, emptyLabel }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [currentDir, setCurrentDir] = useState(rootDir)
  const [entries, setEntries] = useState<ServerFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editingPath, setEditingPath] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [loadingContent, setLoadingContent] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    window.api
      .listServerFiles(serverId, currentDir)
      .then(setEntries)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [serverId, currentDir])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function openFile(path: string): Promise<void> {
    setEditingPath(path)
    setLoadingContent(true)
    setError(null)
    try {
      const text = await window.api.readServerFile(serverId, path)
      setContent(text ?? '')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoadingContent(false)
    }
  }

  async function handleSave(): Promise<void> {
    if (!editingPath) return
    try {
      await window.api.writeServerFile(serverId, editingPath, content)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  if (editingPath) {
    return (
      <div>
        <div className="detail-tab-header">
          <button type="button" onClick={() => setEditingPath(null)}>
            {t('serverHost.files.back')}
          </button>
          <span className="instance-meta">{editingPath}</span>
        </div>
        {error && <p className="error">{error}</p>}
        {loadingContent ? (
          <p className="instance-meta">{t('common.loading')}</p>
        ) : (
          <textarea
            className="notes-textarea file-editor-textarea"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            spellCheck={false}
          />
        )}
        <div className="modal-actions">
          <button type="button" className="save-button" onClick={handleSave}>
            {t('common.save')}
          </button>
          {saved && <span className="instance-meta">{t('common.saved')}</span>}
        </div>
      </div>
    )
  }

  return (
    <div>
      {currentDir !== rootDir && (
        <div className="detail-tab-header">
          <button
            type="button"
            onClick={() => setCurrentDir((prev) => prev.slice(0, prev.lastIndexOf('/')) || rootDir)}
          >
            {t('serverHost.files.up')}
          </button>
          <span className="instance-meta">{currentDir}</span>
        </div>
      )}

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="instance-meta">{emptyLabel}</p>
      ) : (
        <ul className="mod-list">
          {entries.map((entry) => (
            <li key={entry.path}>
              <span className="mod-row">
                <span className="mod-icon mod-icon-fallback">{entry.isDirectory ? '📁' : '📄'}</span>
                <span className="mod-name-block">
                  <span className="mod-title">{entry.name}</span>
                </span>
              </span>
              {entry.isDirectory ? (
                <button type="button" onClick={() => setCurrentDir(entry.path)}>
                  {t('serverHost.files.open')}
                </button>
              ) : entry.editable ? (
                <button type="button" onClick={() => openFile(entry.path)}>
                  {t('serverHost.files.edit')}
                </button>
              ) : (
                <span className="instance-meta">{t('serverHost.files.notEditable')}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default FileConfigBrowser
