import { useEffect, useState } from 'react'
import type { Instance, InstanceSettingsPatch, JavaInstallation } from '../types'
import VersionTab from './VersionTab'
import ModsTab from './ModsTab'
import FileListTab from './FileListTab'
import WorldsTab from './WorldsTab'
import ServersTab from './ServersTab'
import LogsTab from './LogsTab'

interface Props {
  instance: Instance
  allInstances: Instance[]
  onClose: () => void
  onInstanceChanged: () => void
}

type TabKey =
  | 'version'
  | 'mods'
  | 'resourcepacks'
  | 'shaderpacks'
  | 'notes'
  | 'worlds'
  | 'servers'
  | 'screenshots'
  | 'settings'
  | 'logs'

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: 'version', label: 'Version' },
  { key: 'mods', label: 'Mods' },
  { key: 'resourcepacks', label: 'Resource Packs' },
  { key: 'shaderpacks', label: 'Shader Packs' },
  { key: 'notes', label: 'Notizen' },
  { key: 'worlds', label: 'Welten' },
  { key: 'servers', label: 'Server' },
  { key: 'screenshots', label: 'Screenshots' },
  { key: 'settings', label: 'Einstellungen' },
  { key: 'logs', label: 'Logs' }
]

function NotesTab({ instance, onSaved }: { instance: Instance; onSaved: () => void }): React.JSX.Element {
  const [notes, setNotes] = useState(instance.notes)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setNotes(instance.notes)
  }, [instance.notes])

  async function save(): Promise<void> {
    if (notes === instance.notes) return
    setSaving(true)
    try {
      await window.api.updateInstanceSettings(instance.id, { notes })
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="detail-tab">
      <textarea
        className="notes-textarea"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={save}
        placeholder="Notizen zu dieser Instanz…"
      />
      {saving && <p className="instance-meta">Speichere…</p>}
    </div>
  )
}

function SettingsTab({
  instance,
  onSaved
}: {
  instance: Instance
  onSaved: () => void
}): React.JSX.Element {
  const [javaOptions, setJavaOptions] = useState<JavaInstallation[]>([])
  const [loadingJava, setLoadingJava] = useState(true)
  const [javaPath, setJavaPath] = useState(instance.javaPath ?? '')
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs ?? '')
  const [mcArgs, setMcArgs] = useState(instance.mcArgs ?? '')
  const [memoryMin, setMemoryMin] = useState(instance.memoryMin)
  const [memoryMax, setMemoryMax] = useState(instance.memoryMax)
  const [windowWidth, setWindowWidth] = useState(instance.windowWidth?.toString() ?? '')
  const [windowHeight, setWindowHeight] = useState(instance.windowHeight?.toString() ?? '')
  const [fullscreen, setFullscreen] = useState(instance.fullscreen)
  const [closeOnLaunch, setCloseOnLaunch] = useState(instance.closeOnLaunch)
  const [autoJoinServer, setAutoJoinServer] = useState(instance.autoJoinServer ?? '')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.api
      .detectJava()
      .then((list) => {
        if (!cancelled) setJavaOptions(list)
      })
      .finally(() => {
        if (!cancelled) setLoadingJava(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const memoryPattern = /^\d+[MG]$/i
  const toMebibytes = (value: string): number => {
    const match = value.match(memoryPattern)
    if (!match) return NaN
    const amount = Number(value.slice(0, -1))
    return value.at(-1)?.toUpperCase() === 'G' ? amount * 1024 : amount
  }
  const memoryValid =
    memoryPattern.test(memoryMin) &&
    memoryPattern.test(memoryMax) &&
    toMebibytes(memoryMin) <= toMebibytes(memoryMax)

  async function handleSave(): Promise<void> {
    if (!memoryValid) return
    const patch: InstanceSettingsPatch = {
      javaPath: javaPath || null,
      jvmArgs: jvmArgs.trim() || null,
      mcArgs: mcArgs.trim() || null,
      memoryMin,
      memoryMax,
      windowWidth: windowWidth ? Number(windowWidth) : null,
      windowHeight: windowHeight ? Number(windowHeight) : null,
      fullscreen,
      closeOnLaunch,
      autoJoinServer: autoJoinServer.trim() || null
    }
    await window.api.updateInstanceSettings(instance.id, patch)
    onSaved()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="detail-tab">
      <section className="settings-section">
        <h4 className="settings-section-title">Java &amp; Speicher</h4>
        <label>
          Java
          {loadingJava ? (
            <p className="instance-meta">Suche Java-Installationen…</p>
          ) : (
            <select value={javaPath} onChange={(e) => setJavaPath(e.target.value)}>
              <option value="">System-Standard (java)</option>
              {javaOptions.map((j) => (
                <option key={j.path} value={j.path}>
                  {j.version} — {j.path}
                </option>
              ))}
            </select>
          )}
        </label>

        <div className="field-row">
          <label>
            Min. Speicher
            <input value={memoryMin} onChange={(e) => setMemoryMin(e.target.value)} placeholder="2G" />
          </label>
          <label>
            Max. Speicher
            <input value={memoryMax} onChange={(e) => setMemoryMax(e.target.value)} placeholder="4G" />
          </label>
        </div>

        {!memoryValid && (
          <p className="error">
            Speicher als Zahl + M oder G angeben (z.B. 2G oder 2048M), Minimum darf Maximum nicht
            überschreiten.
          </p>
        )}
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">Erweitert</h4>
        <label>
          Zusätzliche Java-Argumente
          <input value={jvmArgs} onChange={(e) => setJvmArgs(e.target.value)} placeholder="z.B. -XX:+UseG1GC" />
        </label>

        <label>
          Zusätzliche Spiel-Argumente
          <input value={mcArgs} onChange={(e) => setMcArgs(e.target.value)} placeholder="optional" />
        </label>

        <label>
          Server automatisch beitreten
          <input
            value={autoJoinServer}
            onChange={(e) => setAutoJoinServer(e.target.value)}
            placeholder="host:port (optional)"
          />
        </label>
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">Fenster</h4>
        <div className="field-row">
          <label>
            Fensterbreite
            <input
              type="number"
              value={windowWidth}
              onChange={(e) => setWindowWidth(e.target.value)}
              placeholder="Standard"
              disabled={fullscreen}
            />
          </label>
          <label>
            Fensterhöhe
            <input
              type="number"
              value={windowHeight}
              onChange={(e) => setWindowHeight(e.target.value)}
              placeholder="Standard"
              disabled={fullscreen}
            />
          </label>
        </div>

        <label className="checkbox-label">
          <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreen(e.target.checked)} />
          Vollbild starten
        </label>

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={closeOnLaunch}
            onChange={(e) => setCloseOnLaunch(e.target.checked)}
          />
          Launcher-Fenster ausblenden, während diese Instanz läuft
        </label>
      </section>

      <div className="modal-actions">
        <button type="button" className="save-button" onClick={handleSave} disabled={!memoryValid}>
          Speichern
        </button>
        {saved && <span className="instance-meta">Gespeichert.</span>}
      </div>
    </div>
  )
}

function InstanceDetailPanel({ instance, allInstances, onClose, onInstanceChanged }: Props): React.JSX.Element {
  const [tab, setTab] = useState<TabKey>('version')

  function renderTab(): React.JSX.Element {
    switch (tab) {
      case 'version':
        return <VersionTab instance={instance} onChanged={onInstanceChanged} />
      case 'mods':
        return <ModsTab instance={instance} allInstances={allInstances} />
      case 'resourcepacks':
        return (
          <FileListTab
            instanceId={instance.id}
            subfolder="resourcepacks"
            addLabel="Datei hinzufügen…"
            emptyLabel="Keine Resource Packs installiert."
          />
        )
      case 'shaderpacks':
        return (
          <FileListTab
            instanceId={instance.id}
            subfolder="shaderpacks"
            addLabel="Datei hinzufügen…"
            emptyLabel="Keine Shader Packs installiert."
          />
        )
      case 'notes':
        return <NotesTab instance={instance} onSaved={onInstanceChanged} />
      case 'worlds':
        return <WorldsTab instanceId={instance.id} />
      case 'servers':
        return <ServersTab instanceId={instance.id} />
      case 'screenshots':
        return (
          <FileListTab
            instanceId={instance.id}
            subfolder="screenshots"
            addLabel="Bild hinzufügen…"
            emptyLabel="Keine Screenshots vorhanden."
          />
        )
      case 'settings':
        return <SettingsTab instance={instance} onSaved={onInstanceChanged} />
      case 'logs':
        return <LogsTab instanceId={instance.id} />
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="instance-detail" onClick={(e) => e.stopPropagation()}>
        <div className="instance-detail-sidebar">
          <h2>{instance.name}</h2>
          <nav>
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`instance-detail-nav-item${tab === t.key ? ' active' : ''}`}
                onClick={() => setTab(t.key)}
                disabled={t.key === 'mods' && instance.loader === 'vanilla'}
              >
                {t.label}
              </button>
            ))}
          </nav>
          <button
            type="button"
            className="instance-detail-open-folder"
            onClick={() => window.api.openInstanceFolder(instance.id)}
          >
            Instanzordner öffnen
          </button>
          <button type="button" onClick={onClose}>
            Schließen
          </button>
        </div>
        <div className="instance-detail-content">{renderTab()}</div>
      </div>
    </div>
  )
}

export default InstanceDetailPanel
