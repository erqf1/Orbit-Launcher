import { useEffect, useState } from 'react'
import OverflowMenu from './OverflowMenu'
import type { Instance } from './types'

export type InstanceViewLayout = 'grid' | 'list'

interface Props {
  instance: Instance
  layout: InstanceViewLayout
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
  onToggleFavorite: (id: string) => void
  onSetGroup: (id: string, group: string | null) => void
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
    layout,
    isLaunching,
    playDisabled,
    manageDisabled,
    onPlay,
    onRename,
    onClone,
    onCloneAsVersion,
    onDelete,
    onManage,
    onIconChanged,
    onToggleFavorite,
    onSetGroup
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

  async function handleCreateShortcut(): Promise<void> {
    try {
      await window.api.createInstanceShortcut(instance.id)
      window.alert(`Verknüpfung für "${instance.name}" auf dem Desktop erstellt.`)
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err))
    }
  }

  function handleSetGroup(): void {
    const input = window.prompt('Gruppenname (leer lassen, um aus der Gruppe zu entfernen):', instance.group ?? '')
    if (input === null) return
    const trimmed = input.trim()
    onSetGroup(instance.id, trimmed || null)
  }

  const overflowItems = [
    { label: 'Umbenennen', onClick: () => setEditing(true) },
    { label: 'Icon ändern…', onClick: handleSetIcon },
    ...(instance.iconFilename ? [{ label: 'Icon entfernen', onClick: handleClearIcon }] : []),
    { label: 'Gruppe…', onClick: handleSetGroup },
    { label: 'Desktop-Verknüpfung erstellen', onClick: handleCreateShortcut },
    { label: 'Duplizieren', onClick: () => onClone(instance.id) },
    { label: 'Duplizieren als…', onClick: () => onCloneAsVersion(instance.id) },
    { label: 'Löschen', onClick: () => onDelete(instance.id), danger: true }
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
          setDraftName(instance.name)
          setEditing(false)
        }
      }}
    />
  ) : (
    <h3 onDoubleClick={() => setEditing(true)}>{instance.name}</h3>
  )

  const favoriteButton = (
    <button
      type="button"
      className={`favorite-star${instance.favorite ? ' active' : ''}`}
      onClick={() => onToggleFavorite(instance.id)}
      title={instance.favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}
    >
      {instance.favorite ? '★' : '☆'}
    </button>
  )

  const tags = (
    <div className="instance-tags">
      <span className="pill pill-version">{instance.mcVersion}</span>
      {instance.loader !== 'vanilla' && (
        <span className={`pill pill-${instance.loader}`}>{LOADER_LABELS[instance.loader]}</span>
      )}
    </div>
  )

  const metaText = isLaunching
    ? 'Läuft gerade'
    : instance.lastPlayed
      ? `Zuletzt gespielt: ${new Date(instance.lastPlayed).toLocaleString('de-DE')}`
      : 'Noch nie gestartet'

  if (layout === 'list') {
    return (
      <div className="instance-row">
        <div className={`instance-row-art loader-${instance.loader}`}>
          {iconUrl ? (
            <img src={iconUrl} alt="" />
          ) : (
            <span className="instance-row-art-glyph">{instance.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {favoriteButton}
        <div className="instance-row-name">{nameElement}</div>
        {tags}
        <div className="instance-row-meta">{isLaunching && <span className="running-pill">läuft</span>}{metaText}</div>
        <div className="instance-row-actions">
          <button className="play-button" onClick={() => onPlay(instance.id)} disabled={playDisabled}>
            {isLaunching ? 'Läuft…' : 'Play'}
          </button>
          <button onClick={() => onManage(instance.id)} disabled={manageDisabled}>
            Verwalten
          </button>
          <OverflowMenu disabled={manageDisabled} items={overflowItems} />
        </div>
      </div>
    )
  }

  return (
    <div className="instance-card">
      <div className={`instance-cover loader-${instance.loader}`}>
        {isLaunching && <span className="running-pill">läuft</span>}
        {favoriteButton}
        {iconUrl ? (
          <img className="instance-cover-icon" src={iconUrl} alt="" />
        ) : (
          <span className="instance-cover-glyph">{instance.name.charAt(0).toUpperCase()}</span>
        )}
      </div>

      <div className="instance-card-body">
        <div className="instance-card-header">
          {nameElement}
          <OverflowMenu disabled={manageDisabled} items={overflowItems} />
        </div>

        {tags}

        <div className="instance-meta">{metaText}</div>

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
