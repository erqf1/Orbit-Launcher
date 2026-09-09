import { useCallback, useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import PluginBrowserDialog from './PluginBrowserDialog'
import FileConfigBrowser from './FileConfigBrowser'
import type { InstalledPlugin, ServerInstance } from '../types'

interface Props {
  server: ServerInstance
}

function ServerPluginsTab({ server }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([])
  const [loading, setLoading] = useState(true)
  const [showBrowser, setShowBrowser] = useState(false)
  const [showConfig, setShowConfig] = useState(false)

  const refresh = useCallback(() => {
    setLoading(true)
    window.api
      .listInstalledPlugins(server.id)
      .then(setPlugins)
      .finally(() => setLoading(false))
  }, [server.id])

  useEffect(() => {
    refresh()
  }, [refresh])

  async function handleRemove(filename: string): Promise<void> {
    await window.api.removePlugin(server.id, filename)
    refresh()
  }

  return (
    <div className="detail-tab">
      <div className="detail-tab-header">
        <button type="button" onClick={() => setShowBrowser(true)}>
          {t('serverHost.plugins.browse')}
        </button>
        <button type="button" onClick={() => setShowConfig((v) => !v)}>
          {t('serverHost.plugins.config')}
        </button>
      </div>

      {showConfig && (
        <FileConfigBrowser serverId={server.id} rootDir="plugins" emptyLabel={t('serverHost.plugins.configEmpty')} />
      )}

      {loading ? (
        <p className="instance-meta">{t('common.loading')}</p>
      ) : plugins.length === 0 ? (
        <p className="instance-meta">{t('serverHost.plugins.empty')}</p>
      ) : (
        <ul className="mod-list">
          {plugins.map((plugin) => (
            <li key={plugin.filename}>
              <span className="mod-row">
                {plugin.iconUrl ? (
                  <img className="mod-icon" src={plugin.iconUrl} alt="" />
                ) : (
                  <span className="mod-icon mod-icon-fallback">{plugin.filename.charAt(0).toUpperCase()}</span>
                )}
                <span className="mod-name-block">
                  <span className="mod-title">{plugin.title ?? plugin.filename}</span>
                </span>
              </span>
              <span className="mod-row-end">
                {plugin.versionNumber && <span className="pill pill-version">V{plugin.versionNumber}</span>}
                <span className="detail-row-actions">
                  <button type="button" onClick={() => handleRemove(plugin.filename)}>
                    {t('common.delete')}
                  </button>
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}

      {showBrowser && (
        <PluginBrowserDialog
          server={server}
          onClose={() => setShowBrowser(false)}
          onInstalled={refresh}
        />
      )}
    </div>
  )
}

export default ServerPluginsTab
