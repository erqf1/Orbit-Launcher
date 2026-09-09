import { useCallback, useEffect, useState } from 'react'
import ServerModBrowserDialog from './ServerModBrowserDialog'
import { useLocale } from '../i18n'
import type { FriendsModEntry, Instance, ModServerCompat, ServerInstance } from '../types'

interface Props {
  server: ServerInstance
}

const CATEGORY_ORDER: ModServerCompat[] = ['clientAndServer', 'clientOnly', 'serverOnly']

// Scans mods/, buckets each into client+server/client-only/server-only (see
// modrinth.ts's classifyModEnvironment), pre-ticks everything not
// server-only (a friend joining needs those in their own client - see
// friendsMods.ts's comment: ambiguous cases default to included, since a
// friend getting one extra mod is far less bad than missing a required
// one), and lets the user override any of it before downloading a real
// .mrpack a friend's launcher (Orbit, Prism, or the Modrinth App) can import.
// Also doubles as this server's mod browser/importer, since both are really
// the same "manage this Fabric server's mods/" concern.
function FriendsModsTab({ server }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [entries, setEntries] = useState<FriendsModEntry[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)
  const [exportedPath, setExportedPath] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showBrowser, setShowBrowser] = useState(false)

  const [instances, setInstances] = useState<Instance[]>([])
  const [importInstanceId, setImportInstanceId] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{ imported: number; skipped: string[] } | null>(null)

  const [installingPack, setInstallingPack] = useState(false)
  const [packResult, setPackResult] = useState<{ installed: number; failed: string[] } | null>(null)

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

  useEffect(() => {
    // Only Fabric client instances make sense as a mod source for a Fabric
    // server - a Forge/NeoForge instance's mods/ can't run on this server
    // at all, so offering it as an import source would just fail confusingly.
    window.api.listInstances().then((all) => setInstances(all.filter((i) => i.loader === 'fabric')))
  }, [])

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

  async function handleImportFromInstance(): Promise<void> {
    if (!importInstanceId) return
    setImporting(true)
    setError(null)
    setImportResult(null)
    try {
      const result = await window.api.importModsFromInstance(server.id, importInstanceId)
      setImportResult({ imported: result.imported.length, skipped: result.skippedClientOnly })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setImporting(false)
    }
  }

  async function handleInstallPerformancePack(): Promise<void> {
    setInstallingPack(true)
    setError(null)
    setPackResult(null)
    try {
      const result = await window.api.installServerPerformanceModpack(server.id, server.mcVersion)
      setPackResult({ installed: result.installed.length, failed: result.failed })
      refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setInstallingPack(false)
    }
  }

  function categoryLabel(key: ModServerCompat): string {
    switch (key) {
      case 'clientAndServer':
        return t('serverHost.friendsMods.categoryBoth')
      case 'clientOnly':
        return t('serverHost.friendsMods.categoryClientOnly')
      case 'serverOnly':
        return t('serverHost.friendsMods.categoryServerOnly')
    }
  }

  const byCategory = CATEGORY_ORDER.map((key) => ({
    key,
    entries: entries.filter((e) => e.compat === key)
  })).filter((group) => group.entries.length > 0)

  return (
    <div className="detail-tab">
      <p className="instance-meta">{t('serverHost.friendsMods.explainer')}</p>

      <div className="detail-tab-header">
        <button type="button" onClick={() => setShowBrowser(true)}>
          {t('serverHost.friendsMods.browse')}
        </button>
        <button type="button" onClick={handleInstallPerformancePack} disabled={installingPack}>
          {installingPack
            ? t('serverHost.friendsMods.installingPack')
            : t('serverHost.friendsMods.installPack')}
        </button>
      </div>
      {packResult && (
        <p className="instance-meta">
          {t('serverHost.friendsMods.packResult', {
            installed: String(packResult.installed),
            failed: String(packResult.failed.length)
          })}
          {packResult.failed.length > 0 && ` (${packResult.failed.join(', ')})`}
        </p>
      )}

      <section className="settings-section">
        <h4 className="settings-section-title">{t('serverHost.friendsMods.importFromInstanceTitle')}</h4>
        {instances.length === 0 ? (
          <p className="instance-meta">{t('serverHost.friendsMods.noFabricInstances')}</p>
        ) : (
          <div className="field-row">
            <select value={importInstanceId} onChange={(e) => setImportInstanceId(e.target.value)}>
              <option value="">{t('serverHost.friendsMods.selectInstance')}</option>
              {instances.map((instance) => (
                <option key={instance.id} value={instance.id}>
                  {instance.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={handleImportFromInstance} disabled={!importInstanceId || importing}>
              {importing ? t('serverHost.friendsMods.importing') : t('serverHost.friendsMods.import')}
            </button>
          </div>
        )}
        {importResult && (
          <p className="instance-meta">
            {t('serverHost.friendsMods.importResult', {
              imported: String(importResult.imported),
              skipped: String(importResult.skipped.length)
            })}
            {importResult.skipped.length > 0 && ` (${importResult.skipped.join(', ')})`}
          </p>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : entries.length === 0 ? (
        <p className="instance-meta">{t('serverHost.friendsMods.empty')}</p>
      ) : (
        byCategory.map((group) => (
          <div key={group.key} className="curated-category">
            <h4>
              {categoryLabel(group.key)} ({group.entries.length})
            </h4>
            <ul className="mod-list">
              {group.entries.map((entry) => (
                <li key={entry.filename}>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={selected.has(entry.filename)}
                      onChange={() => toggle(entry.filename)}
                    />
                    <span className="mod-title">{entry.title}</span>
                  </label>
                  {!entry.resolved && (
                    <span className="mod-row-end">
                      <span className="pill pill-version" title={t('serverHost.friendsMods.unresolvedTooltip')}>
                        {t('serverHost.friendsMods.unresolved')}
                      </span>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))
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
            : t('serverHost.friendsMods.downloadMods', { count: selected.size })}
        </button>
        {exportedPath && (
          <span className="instance-meta">{t('serverHost.friendsMods.exported', { path: exportedPath })}</span>
        )}
      </div>

      {showBrowser && (
        <ServerModBrowserDialog
          server={server}
          installed={entries}
          onClose={() => setShowBrowser(false)}
          onInstalled={refresh}
        />
      )}
    </div>
  )
}

export default FriendsModsTab
