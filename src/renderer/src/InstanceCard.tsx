import { useEffect, useState } from 'react'
import OverflowMenu from './OverflowMenu'
import type { Instance } from './types'

interface Props {
  instance: Instance
  isLaunching: boolean
  playDisabled: boolean
  manageDisabled: boolean
  onPlay: (id: string) => void
  onRename: (id: string, name: string) => void
  onClone: (id: string) => void
  onCloneAsVersion: (id: string) => void
  onDelete: (id: string) => void
  onManage: (id: string) => void
  onIconChanged: () => void
}

const LOADER_LABELS: Record<string, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  legacyfabric: 'Legacy Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

function InstanceCard(props: Props): React.JSX.Element {
  const {
    instance,
    isLaunching,
    playDisabled,
    manageDisabled,
    onPlay,
    onRename,
    onClone,
    onCloneAsVersion,
    onDelete,
    onManage,
    onIconChanged
  } = props
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(instance.name)
  const [iconUrl, setIconUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!instance.iconFilename) {
      setIconUrl(null)
      return
    }
    window.api.getInstanceIconDataUrl(instance.id).then((url) => {
      if (!cancelled) setIconUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [instance.id, instance.iconFilename])

  function confirmRename(): void {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== instance.name) {
      onRename(instance.id, trimmed)
    } else {
      setDraftName(instance.name)
    }
    setEditing(false)
  }

  async function handleSetIcon(): Promise<void> {
    await window.api.setInstanceIcon(instance.id)
    onIconChanged()
  }

  async function handleClearIcon(): Promise<void> {
    await window.api.clearInstanceIcon(instance.id)
    onIconChanged()
  }

  return (
    <div className="instance-card">
      {isLaunching && <span className="running-badge">läuft</span>}

      <div className={`instance-card-art loader-${instance.loader}`}>
        {iconUrl ? (
          <img src={iconUrl} alt="" />
        ) : (
          <span className="instance-card-art-fallback">{instance.name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      <div className="instance-card-body">
        <div className="instance-card-header">
          {editing ? (
            <input
              className="rename-input"
              value={draftName}
              autoFocus
              onChange={(e) => setDraftName(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename()
                if (e.key === 'Escape') {
                  setDraftName(instance.name)
                  setEditing(false)
                }
              }}
            />
          ) : (
            <h3 onDoubleClick={() => setEditing(true)}>{instance.name}</h3>
          )}
          <OverflowMenu
            disabled={manageDisabled}
            items={[
              { label: 'Umbenennen', onClick: () => setEditing(true) },
              { label: 'Icon ändern…', onClick: handleSetIcon },
              ...(instance.iconFilename
                ? [{ label: 'Icon entfernen', onClick: handleClearIcon }]
                : []),
              { label: 'Duplizieren', onClick: () => onClone(instance.id) },
              { label: 'Duplizieren als…', onClick: () => onCloneAsVersion(instance.id) },
              { label: 'Löschen', onClick: () => onDelete(instance.id), danger: true }
            ]}
          />
        </div>

        <div className="instance-tags">
          <span className="instance-version-pill">{instance.mcVersion}</span>
          {instance.loader !== 'vanilla' && (
            <span className={`instance-loader-pill loader-${instance.loader}`}>
              {LOADER_LABELS[instance.loader]}
            </span>
          )}
        </div>

        <div className="instance-meta">
          {isLaunching
            ? 'Läuft gerade'
            : instance.lastPlayed
              ? `Zuletzt gespielt: ${new Date(instance.lastPlayed).toLocaleString('de-DE')}`
              : 'Noch nie gestartet'}
        </div>

        <div className="instance-card-actions">
          <button className="play-button" onClick={() => onPlay(instance.id)} disabled={playDisabled}>
            {isLaunching ? 'Läuft…' : 'Play'}
          </button>
          <button onClick={() => onManage(instance.id)} disabled={manageDisabled}>
            Verwalten
          </button>
        </div>
      </div>
    </div>
  )
}

export default InstanceCard
