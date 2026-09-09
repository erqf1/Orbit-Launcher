import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { FriendsModEntry, ServerInstance } from '../types'

interface Props {
  server: ServerInstance
}

// Scans mods/, pre-ticks everything scanServerMods judged client-required
// (see friendsMods.ts's comment: ambiguous cases default to included, since
// a friend getting one extra mod is far less bad than missing a required
// one), and lets the user override any of it before exporting a real
// .mrpack a friend's launcher (Orbit, Prism, or the Modrinth App) can import.
function FriendsModsTab({ server }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [entries, setEntries] = useState<FriendsModEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(() => {
    setLoading(true)
    setError(null)
    window.api
      .scanFriendsMods(server.id)
      .then((result) => {
        setEntries(result)
        setSelected(new Set(result.filter((e) => e.suggestedInclude).map((e) => e.filename)))
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false))
  }, [server.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  function toggle(filename: string): void {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(filename)) next.delete(filename)
      else next.add(filename)
      return next
    })
  }

  async function handleExport(): Promise<void> {
    setExporting(true)
    setError(null)
    setExportedPath(null)
    try {
      const path = await window.api.exportFriendsMods(server.id, [...selected])
      if (path) setExportedPath(path)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="detail-tab">
      <p className="instance-meta">{t('serverHost.friendsMods.explainer')}</p>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="instance-meta">{t('serverHost.friendsMods.empty')}</p>
      ) : (
        <ul className="mod-list">
          {entries.map((entry) => (
            <li key={entry.filename}>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selected.has(entry.filename)}
                  onChange={() => toggle(entry.filename)}
                />
                <span className="mod-title">{entry.title}</span>
              </label>
              <span className="mod-row-end">
                <span className="pill pill-version">{entry.environment}</span>
                {!entry.resolved && (
                  <span className="pill pill-version" title={t('serverHost.friendsMods.unresolvedTooltip')}>
                    {t('serverHost.friendsMods.unresolved')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="modal-actions">
        <button
          type="button"
          className="save-button"
          onClick={handleExport}
          disabled={exporting || selected.size === 0}
        >
          {exporting
            ? t('serverHost.friendsMods.exporting')
            : t('serverHost.friendsMods.export', { count: selected.size })}
        </button>
        {exportedPath && (
          <span className="instance-meta">{t('serverHost.friendsMods.exported', { path: exportedPath })}</span>
        )}
      </div>
    </div>
  )
}

export default FriendsModsTab
