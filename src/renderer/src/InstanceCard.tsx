import { useState } from 'react'
import type { Instance } from './types'

interface Props {
  instance: Instance
  isLaunching: boolean
  playDisabled: boolean
  manageDisabled: boolean
  onPlay: (id: string) => void
  onRename: (id: string, name: string) => void
  onClone: (id: string) => void
  onDelete: (id: string) => void
}

function InstanceCard(props: Props): React.JSX.Element {
  const { instance, isLaunching, playDisabled, manageDisabled, onPlay, onRename, onClone, onDelete } =
    props
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
        <span className="instance-version">{instance.mcVersion}</span>
      </div>

      <div className="instance-meta">
        {instance.lastPlayed
          ? `Zuletzt gespielt: ${new Date(instance.lastPlayed).toLocaleString('de-DE')}`
          : 'Noch nie gestartet'}
      </div>

      <div className="instance-actions">
        <button className="play-button" onClick={() => onPlay(instance.id)} disabled={playDisabled}>
          {isLaunching ? 'Läuft…' : 'Play'}
        </button>
        <button onClick={() => setEditing(true)} disabled={manageDisabled}>
          Umbenennen
        </button>
        <button onClick={() => onClone(instance.id)} disabled={manageDisabled}>
          Duplizieren
        </button>
        <button onClick={() => onDelete(instance.id)} disabled={manageDisabled}>
          Löschen
        </button>
      </div>
    </div>
  )
}

export default InstanceCard
