import { useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { ServerInstance } from '../types'
import ServerConsoleTab from './ServerConsoleTab'
import ServerPropertiesTab from './ServerPropertiesTab'
import ServerGeneralTab from './ServerGeneralTab'
import ServerPluginsTab from './ServerPluginsTab'
import ServerPaperConfigTab from './ServerPaperConfigTab'
import FriendsModsTab from './FriendsModsTab'
import { useBackdropClose } from '../useBackdropClose'

interface Props {
  server: ServerInstance
  onClose: () => void
  onServerChanged: () => void
}

type TabKey = 'console' | 'properties' | 'plugins' | 'paperConfig' | 'friendsMods' | 'general'

function ServerHostDetailPanel({ server, onClose, onServerChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [tab, setTab] = useState<TabKey>('console')
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(server.name)
  const [renameError, setRenameError] = useState<string | null>(null)

  useEffect(() => {
    setNameDraft(server.name)
  }, [server.name])

  async function confirmRename(): Promise<void> {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== server.name) {
      try {
        await window.api.renameHostedServer(server.id, trimmed)
        onServerChanged()
        setRenameError(null)
      } catch (err) {
        setRenameError(err instanceof Error ? err.message : String(err))
        setNameDraft(server.name)
      }
    } else {
      setNameDraft(server.name)
    }
    setEditingName(false)
  }

  // Plugins only make sense for a Bukkit-API server (Paper); the
  // friends'-mods export only makes sense for Fabric, since that's the only
  // loader this app can actually resolve a mods/ folder against Modrinth's
  // Fabric-tagged versions for.
  const tabs: TabKey[] = [
    'console',
    'properties',
    ...(server.loader === 'paper' ? (['plugins', 'paperConfig'] as TabKey[]) : []),
    ...(server.loader === 'fabric' ? (['friendsMods'] as TabKey[]) : []),
    'general'
  ]

  function tabLabel(key: TabKey): string {
    switch (key) {
      case 'console':
        return t('serverHost.tabs.console')
      case 'properties':
        return t('serverHost.tabs.properties')
      case 'plugins':
        return t('serverHost.tabs.plugins')
      case 'paperConfig':
        return t('serverHost.tabs.paperConfig')
      case 'friendsMods':
        return t('serverHost.tabs.friendsMods')
      case 'general':
        return t('serverHost.tabs.general')
    }
  }

  function renderTab(): React.JSX.Element {
    switch (tab) {
      case 'console':
        return <ServerConsoleTab server={server} onChanged={onServerChanged} />
      case 'properties':
        return <ServerPropertiesTab server={server} onChanged={onServerChanged} />
      case 'plugins':
        return <ServerPluginsTab server={server} />
      case 'paperConfig':
        return <ServerPaperConfigTab server={server} />
      case 'friendsMods':
        return <FriendsModsTab server={server} />
      case 'general':
        return <ServerGeneralTab server={server} onSaved={onServerChanged} />
    }
  }

  return (
    <div className="modal-backdrop" {...useBackdropClose(onClose)}>
      <div className="instance-detail" onClick={(e) => e.stopPropagation()}>
        <div className="instance-detail-sidebar">
          {editingName ? (
            <input
              className="rename-input instance-detail-name-input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename()
                if (e.key === 'Escape') {
                  setNameDraft(server.name)
                  setEditingName(false)
                }
              }}
            />
          ) : (
            <h2 onDoubleClick={() => setEditingName(true)} title={t('detail.renameTooltip')}>
              {server.name}
            </h2>
          )}
          {renameError && <p className="error">{renameError}</p>}
          <nav>
            {tabs.map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                className={`instance-detail-nav-item${tab === tabKey ? ' active' : ''}`}
                onClick={() => setTab(tabKey)}
              >
                {tabLabel(tabKey)}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="instance-detail-open-folder"
            onClick={() => window.api.openHostedServerFolder(server.id)}
          >
            {t('detail.openInstanceFolder')}
          </button>
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <div className="instance-detail-content">{renderTab()}</div>
      </div>
    </div>
  )
}

export default ServerHostDetailPanel
