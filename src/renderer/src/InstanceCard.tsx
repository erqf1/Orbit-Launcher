import { useEffect, useRef, useState } from 'react'
import OverflowMenu from './OverflowMenu'
import { INTL_LOCALE, useLocale } from './i18n'
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
  onCloneAsVersion: (id: string) => void
  onDelete: (id: string) => void
  onManage: (id: string) => void
  onIconChanged: () => void
  onToggleFavorite: (id: string) => void
  onSetGroup: (id: string, group: string | null) => void
  onSetCoverColor: (id: string, color: string | null) => void
}

// Builds the cover's two-stop gradient from a single user-picked color -
// darkened by scaling each channel down, same visual idea as the existing
// per-loader gradients (a lighter top, darker bottom).
function darken(hex: string, factor: number): string {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!match) return hex
  const num = parseInt(match[1], 16)
  const r = Math.round(((num >> 16) & 0xff) * factor)
  const g = Math.round(((num >> 8) & 0xff) * factor)
  const b = Math.round((num & 0xff) * factor)
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`
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
    onCloneAsVersion,
    onDelete,
    onManage,
    onIconChanged,
    onToggleFavorite,
    onSetGroup,
    onSetCoverColor
  } = props
  const { t, locale } = useLocale()
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(instance.name)
  const [iconUrl, setIconUrl] = useState<string | null>(null)
  const [bannerUrl, setBannerUrl] = useState<string | null>(null)
  const colorInputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    let cancelled = false
    if (!instance.bannerFilename) {
      setBannerUrl(null)
      return
    }
    window.api.getInstanceBannerDataUrl(instance.id).then((url) => {
      if (!cancelled) setBannerUrl(url)
    })
    return () => {
      cancelled = true
    }
  }, [instance.id, instance.bannerFilename])

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

  async function handleSetBanner(): Promise<void> {
    await window.api.setInstanceBanner(instance.id)
    onIconChanged()
  }

  async function handleClearBanner(): Promise<void> {
    await window.api.clearInstanceBanner(instance.id)
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
    { label: t('overflow.rename'), onClick: () => setEditing(true) },
    { label: t('overflow.setIcon'), onClick: handleSetIcon },
    ...(instance.iconFilename ? [{ label: t('overflow.removeIcon'), onClick: handleClearIcon }] : []),
    { label: t('overflow.setColor'), onClick: () => colorInputRef.current?.click() },
    ...(instance.coverColor
      ? [{ label: t('overflow.resetColor'), onClick: () => onSetCoverColor(instance.id, null) }]
      : []),
    { label: t('overflow.setBanner'), onClick: handleSetBanner },
    ...(instance.bannerFilename ? [{ label: t('overflow.resetBanner'), onClick: handleClearBanner }] : []),
    { label: t('overflow.setGroup'), onClick: handleSetGroup },
    { label: t('overflow.createShortcut'), onClick: handleCreateShortcut },
    { label: t('overflow.duplicate'), onClick: () => onCloneAsVersion(instance.id) },
    { label: t('overflow.delete'), onClick: () => onDelete(instance.id), danger: true }
  ]

  const coverColorInput = (
    <input
      ref={colorInputRef}
      type="color"
      className="cover-color-input"
      value={instance.coverColor ?? '#5b9dff'}
      onChange={(e) => onSetCoverColor(instance.id, e.target.value)}
      // The native color picker popup can leave the window without real OS
      // input focus once it closes (same Windows/Electron quirk as native
      // file dialogs) - blur is the only event it reliably fires either way.
      onBlur={() => window.focus()}
    />
  )

  const coverStyle = {
    ...(instance.coverColor
      ? { '--cover-a': instance.coverColor, '--cover-b': darken(instance.coverColor, 0.5) }
      : {}),
    ...(bannerUrl ? { backgroundImage: `url(${bannerUrl})` } : {})
  } as React.CSSProperties

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
    ? t('instances.playing')
    : instance.lastPlayed
      ? t('instances.lastPlayed', { date: new Date(instance.lastPlayed).toLocaleString(INTL_LOCALE[locale]) })
      : t('instances.neverStarted')

  if (layout === 'list') {
    return (
      <div className="instance-row">
        {coverColorInput}
        <div
          className={`instance-row-art loader-${instance.loader}${bannerUrl ? ' has-banner' : ''}`}
          style={coverStyle}
        >
          {iconUrl ? (
            <img src={iconUrl} alt="" />
          ) : (
            <span className="instance-row-art-glyph">{instance.name.charAt(0).toUpperCase()}</span>
          )}
        </div>
        {favoriteButton}
        <div className="instance-row-name">{nameElement}</div>
        {tags}
        <div className="instance-row-meta">{isLaunching && <span className="running-pill">{t('instances.running')}</span>}{metaText}</div>
        <div className="instance-row-actions">
          <button className="play-button" onClick={() => onPlay(instance.id)} disabled={playDisabled}>
            {isLaunching ? t('instances.playing') : t('instances.play')}
          </button>
          <button onClick={() => onManage(instance.id)} disabled={manageDisabled}>
            {t('instances.manage')}
          </button>
          <OverflowMenu disabled={manageDisabled} items={overflowItems} />
        </div>
      </div>
    )
  }

  return (
    <div className="instance-card">
      {coverColorInput}
      <div
        className={`instance-cover loader-${instance.loader}${bannerUrl ? ' has-banner' : ''}`}
        style={coverStyle}
      >
        {isLaunching && <span className="running-pill">{t('instances.running')}</span>}
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
            {isLaunching ? t('instances.playing') : t('instances.play')}
          </button>
          <button onClick={() => onManage(instance.id)} disabled={manageDisabled}>
            {t('instances.manage')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default InstanceCard
