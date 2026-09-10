import { useEffect, useState } from 'react'
import OverflowMenu from './OverflowMenu'
import { useLocale } from './i18n'
import type { ServerInstance } from './types'

interface Props {
  server: ServerInstance
  isRunning: boolean
  // Whether the shared playit.gg tunnel (see PlayitSettingsDialog) has a
  // public address assigned at all - the tunnel itself is launcher-wide now,
  // not per-server, so "reachable via the tunnel" additionally requires
  // this specific server to be both running and configured to use it.
  tunnelHasAddress: boolean
  onManage: (id: string) => void
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  onStart: (id: string) => void
  onStop: (id: string) => void
  onIconChanged: () => void
}

const LOADER_LABELS: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  paper: 'Paper'
}

// Reuses .instance-card's CSS - an icon/banner renders exactly like a
// client Instance's (InstanceCard.tsx), falling back to the same
// loader-colored gradient + initial-letter glyph when neither is set.
function ServerHostCard({
  server,
  isRunning,
  tunnelHasAddress,
  onManage,
  onRename,
  onDelete,
  onStart,
  onStop,
  onIconChanged
}: Props): React.JSX.Element {
  const { t } = useLocale()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(server.name)
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!server.iconFilename) {
      setIconUrl(null)
      return
    }
    window.api.getHostedServerIconDataUrl(server.id).then((url) => {
      if (!cancelled) setIconUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [server.id, server.iconFilename])

  useEffect(() => {
    let cancelled = false
    if (!server.bannerFilename) {
      setBannerUrl(null)
      return
    }
    window.api.getHostedServerBannerDataUrl(server.id).then((url) => {
      if (!cancelled) setBannerUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [server.id, server.bannerFilename])

  function confirmRename(): void {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== server.name) {
      onRename(server.id, trimmed)
    } else {
      setDraftName(server.name)
    }
    setEditing(false)
  }

  async function handleSetIcon(): Promise<void> {
    await window.api.setHostedServerIcon(server.id)
    onIconChanged()
  }

  async function handleClearIcon(): Promise<void> {
    await window.api.clearHostedServerIcon(server.id)
    onIconChanged()
  }

  async function handleSetBanner(): Promise<void> {
    await window.api.setHostedServerBanner(server.id)
    onIconChanged()
  }

  async function handleClearBanner(): Promise<void> {
    await window.api.clearHostedServerBanner(server.id)
    onIconChanged()
  }

  const overflowItems = [
    { label: t('overflow.setIcon'), onClick: handleSetIcon },
    ...(server.iconFilename ? [{ label: t('overflow.removeIcon'), onClick: handleClearIcon }] : []),
    { label: t('overflow.setBanner'), onClick: handleSetBanner },
    ...(server.bannerFilename ? [{ label: t('overflow.resetBanner'), onClick: handleClearBanner }] : [])
  ]

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

  const coverStyle = bannerUrl ? ({ backgroundImage: `url(${bannerUrl})` } as React.CSSProperties) : undefined

  return (
    <div className="instance-card">
      <div
        className={`instance-cover loader-${server.loader}${bannerUrl ? ' has-banner' : ''}`}
        style={coverStyle}
      >
        {isRunning && <span className="running-pill">{t('serverHost.running')}</span>}
        {iconUrl ? (
          <img className="instance-cover-icon" src={iconUrl} alt="" />
        ) : (
          <span className="instance-cover-glyph">{server.name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      <div className="instance-card-body">
        <div className="instance-card-header">{nameElement}</div>

        <div className="instance-tags">
          <span className="pill pill-version">{server.mcVersion}</span>
          {server.loader !== 'vanilla' && (
            <span className={`pill pill-${server.loader}`}>{LOADER_LABELS[server.loader]}</span>
          )}
          {isRunning && tunnelHasAddress && (
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
          {isRunning ? (
            <button type="button" className="play-button" onClick={() => onStop(server.id)}>
              {t('serverHost.console.stop')}
            </button>
          ) : (
            <button type="button" className="play-button" onClick={() => onStart(server.id)}>
              {t('serverHost.console.start')}
            </button>
          )}
          <button type="button" onClick={() => onManage(server.id)}>
            {t('serverHost.manage')}
          </button>
          <button type="button" onClick={() => onDelete(server.id)} disabled={isRunning}>
            {t('common.delete')}
          </button>
          <OverflowMenu items={overflowItems} />
        </div>
      </div>
    </div>
  )
}

export default ServerHostCard
