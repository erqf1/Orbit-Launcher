import { useState } from 'react'
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
        <span className="instance-version">
          {instance.mcVersion}
          {instance.loader !== 'vanilla' && ` · ${instance.loader}`}
        </span>
      </div>

      <div className="instance-meta">
        {activeLaunches > 0
          ? `${activeLaunches}× läuft gerade`
          : instance.lastPlayed
            ? `Zuletzt gespielt: ${new Date(instance.lastPlayed).toLocaleString('de-DE')}`
            : 'Noch nie gestartet'}
      </div>

      <div className="instance-actions">
        <button className="play-button" onClick={() => onPlay(instance.id)} disabled={playDisabled}>
          Play
        </button>
        <button onClick={() => setEditing(true)} disabled={manageDisabled}>
          Umbenennen
        </button>
        <button onClick={() => onClone(instance.id)} disabled={manageDisabled}>
          Duplizieren
        </button>
        <button onClick={() => onCloneAsVersion(instance.id)} disabled={manageDisabled}>
          Duplizieren als…
        </button>
        <button
          onClick={() => onOpenMods(instance.id)}
          disabled={manageDisabled || instance.loader === 'vanilla'}
          title={instance.loader === 'vanilla' ? 'Vanilla-Instanzen unterstützen keine Mods' : undefined}
        >
          Mods
        </button>
        <button onClick={() => onOpenSettings(instance.id)} disabled={manageDisabled}>
          Einstellungen
        </button>
        <button onClick={() => onDelete(instance.id)} disabled={manageDisabled}>
          Löschen
        </button>
      </div>
    </div>
  )
}

export default InstanceCard
