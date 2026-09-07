import { useState } from 'react'
import OverflowMenu from './OverflowMenu'
import type { Instance } from './types'

interface Props {
  instance: Instance
  activeLaunches: number
  playDisabled: boolean
  manageDisabled: boolean
  onPlay: (id: string) => void
  onRename: (id: string, name: string) => void
  onClone: (id: string) => void
  onCloneAsVersion: (id: string) => void
  onDelete: (id: string) => void
  onOpenSettings: (id: string) => void
  onOpenMods: (id: string) => void
}

function InstanceCard(props: Props): React.JSX.Element {
  const {
    instance,
    activeLaunches,
    playDisabled,
    manageDisabled,
    onPlay,
    onRename,
    onClone,
    onCloneAsVersion,
    onDelete,
    onOpenSettings,
    onOpenMods
  } = props
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(instance.name)

  function confirmRename(): void {
    const trimmed = draftName.trim()
    if (trimmed && trimmed !== instance.name) {
      onRename(instance.id, trimmed)
    } else {
      setDraftName(instance.name)
    }
    setEditing(false)
  }

  return (
    <div className="instance-card">
      {activeLaunches > 0 && <span className="running-badge">{activeLaunches}×</span>}

      <div className={`loader-stripe loader-${instance.loader}`} />

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
              { label: 'Duplizieren', onClick: () => onClone(instance.id) },
              { label: 'Duplizieren als…', onClick: () => onCloneAsVersion(instance.id) },
              {
                label: 'Mods',
                onClick: () => onOpenMods(instance.id),
                disabled: instance.loader === 'vanilla'
              },
              { label: 'Einstellungen', onClick: () => onOpenSettings(instance.id) },
              { label: 'Löschen', onClick: () => onDelete(instance.id), danger: true }
            ]}
          />
        </div>

        <span className="instance-version">
          {instance.mcVersion}
          {instance.loader !== 'vanilla' && ` · ${instance.loader}`}
        </span>

        <div className="instance-meta">
          {activeLaunches > 0
            ? `Läuft gerade`
            : instance.lastPlayed
              ? `Zuletzt gespielt: ${new Date(instance.lastPlayed).toLocaleString('de-DE')}`
              : 'Noch nie gestartet'}
        </div>

        <button className="play-button" onClick={() => onPlay(instance.id)} disabled={playDisabled}>
          Play
        </button>
      </div>
    </div>
  )
}

export default InstanceCard
