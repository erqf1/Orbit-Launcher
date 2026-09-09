import { useState } from 'react'
import { useLocale } from './i18n'
import type { ServerInstance } from './types'

interface Props {
  server: ServerInstance
  isRunning: boolean
  onManage: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
}

const LOADER_LABELS: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  paper: 'Paper'
}

// Deliberately reuses .instance-card's CSS (icon/banner customization
// dropped for this MVP - a hosted server's identity is its Console tab, not
// a cover image) so it fits visually into the same grid layout without new
// CSS, just a loader-colored gradient like an un-iconed instance card gets.
function ServerHostCard({ server, isRunning, onManage, onRename, onDelete }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(server.name)

  function confirmRename(): void {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== server.name) {
      onRename(server.id, trimmed)
    } else {
      setDraftName(server.name)
    }
    setEditing(false)
  }

  const nameElement = editing ? (
    <input
      className="rename-input"
      value={draftName}
      autoFocus
      onChange={(e) => setDraftName(e.target.value)}
      onBlur={confirmRename}
      onKeyDown={(e) => {
        if (e.key === 'Enter') confirmRename()
        if (e.key === 'Escape') {
          setDraftName(server.name)
          setEditing(false)
        }
      }}
    />
  ) : (
    <h3 onDoubleClick={() => setEditing(true)}>{server.name}</h3>
  )

  return (
    <div className="instance-card">
      <div className={`instance-cover loader-${server.loader}`}>
        {isRunning && <span className="running-pill">{t('serverHost.running')}</span>}
        <span className="instance-cover-glyph">{server.name.charAt(0).toUpperCase()}</span>
      </div>

      <div className="instance-card-body">
        <div className="instance-card-header">{nameElement}</div>

        <div className="instance-tags">
          <span className="pill pill-version">{server.mcVersion}</span>
          {server.loader !== 'vanilla' && (
            <span className={`pill pill-${server.loader}`}>{LOADER_LABELS[server.loader]}</span>
          )}
          {server.tunnelPublicAddress && (
            <span className="pill pill-version" title={t('serverHost.tunnelActiveTooltip')}>
              {t('serverHost.tunnelActive')}
            </span>
          )}
        </div>

        <div className="instance-meta">
          {isRunning
            ? t('serverHost.running')
            : server.lastStarted
              ? t('serverHost.lastStarted', { date: new Date(server.lastStarted).toLocaleString() })
              : t('serverHost.neverStarted')}
        </div>

        <div className="instance-card-actions">
          <button className="play-button" onClick={() => onManage(server.id)}>
            {t('serverHost.manage')}
          </button>
          <button type="button" onClick={() => onDelete(server.id)} disabled={isRunning}>
            {t('common.delete')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ServerHostCard
