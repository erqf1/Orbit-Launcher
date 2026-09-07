import { useCallback, useEffect, useState } from 'react'
import InstanceCard from './InstanceCard'
import CreateInstanceDialog from './CreateInstanceDialog'
import CloneAsVersionDialog from './CloneAsVersionDialog'
import InstanceSettingsDialog from './InstanceSettingsDialog'
import ModBrowserDialog from './ModBrowserDialog'
import PrismImportDialog from './PrismImportDialog'
import type { Instance, InstanceSettingsPatch, LoaderType } from './types'

interface Profile {
  name: string
  id: string
}

// Keyed by instanceId, not launchId: the backend guarantees at most one
// active launch per instance (different instances may run concurrently,
// the same one can't be started twice), so instanceId is already a unique
// key and there's no need to track launchId on the renderer side at all.
interface LaunchSession {
  logs: string[]
  closed: boolean
  exitCode: number | null
}

function App(): React.JSX.Element {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [instances, setInstances] = useState<Instance[]>([])
  const [launches, setLaunches] = useState<Record<string, LaunchSession>>({})
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [settingsInstanceId, setSettingsInstanceId] = useState<string | null>(null)
  const [modsInstanceId, setModsInstanceId] = useState<string | null>(null)
  const [cloneAsVersionInstanceId, setCloneAsVersionInstanceId] = useState<string | null>(null)
  const [showPrismImport, setShowPrismImport] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshInstances = useCallback(() => {
    window.api.listInstances().then(setInstances)
  }, [])

  useEffect(() => {
    refreshInstances()
    window.api.currentAccount().then((result) => {
      if (result.profile) setProfile(result.profile)
    })
  }, [refreshInstances])

  useEffect(() => {
    const offLog = window.api.onLog(({ instanceId, line }) => {
      setLaunches((prev) => {
        const existing = prev[instanceId] ?? { logs: [], closed: false, exitCode: null }
        return { ...prev, [instanceId]: { ...existing, logs: [...existing.logs, line] } }
      })
    })
    const offClosed = window.api.onClosed(({ instanceId, code }) => {
      setLaunches((prev) => {
        const existing = prev[instanceId] ?? { logs: [], closed: false, exitCode: null }
        return { ...prev, [instanceId]: { ...existing, closed: true, exitCode: code } }
      })
    })
    return () => {
      offLog()
      offClosed()
    }
  }, [])

  async function handleLogin(): Promise<void> {
    setError(null)
    setLoggingIn(true)
    try {
      const result = await window.api.login()
      setProfile(result.profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoggingIn(false)
    }
  }

  async function handlePlay(id: string): Promise<void> {
    setError(null)
    setLaunches((prev) => ({ ...prev, [id]: { logs: [], closed: false, exitCode: null } }))
    setSelectedInstanceId(id)
    try {
      await window.api.launch(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLaunches((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
    }
  }

  function dismissLaunch(instanceId: string): void {
    setLaunches((prev) => {
      const next = { ...prev }
      delete next[instanceId]
      return next
    })
    if (selectedInstanceId === instanceId) setSelectedInstanceId(null)
  }

  // Errors intentionally propagate to the caller (the dialog) instead of
  // being caught here - the dialog is a modal, so App's own error banner
  // would be hidden behind it. The dialog shows the error itself.
  async function handleCreate(
    name: string,
    mcVersion: string,
    loader: LoaderType,
    loaderVersion?: string
  ): Promise<void> {
    await window.api.createInstance({ name, mcVersion, loader, loaderVersion })
    setShowCreate(false)
    refreshInstances()
  }

  async function handleCloneAsVersion(
    id: string,
    mcVersion: string,
    loader: LoaderType,
    loaderVersion?: string
  ): Promise<void> {
    await window.api.cloneInstanceAsVersion(id, { mcVersion, loader, loaderVersion })
    setCloneAsVersionInstanceId(null)
    refreshInstances()
  }

  async function handleRename(id: string, name: string): Promise<void> {
    await window.api.renameInstance(id, name)
    refreshInstances()
  }

  async function handleClone(id: string): Promise<void> {
    await window.api.cloneInstance(id)
    refreshInstances()
  }

  async function handleSaveSettings(id: string, patch: InstanceSettingsPatch): Promise<void> {
    await window.api.updateInstanceSettings(id, patch)
    setSettingsInstanceId(null)
    refreshInstances()
  }

  async function handleDelete(id: string): Promise<void> {
    const instance = instances.find((i) => i.id === id)
    const label = instance ? instance.name : 'diese Instanz'
    if (launches[id] && !launches[id].closed) {
      setError(`"${label}" läuft gerade und kann nicht gelöscht werden.`)
      return
    }
    const sure = window.confirm(
      `"${label}" wirklich löschen? Das entfernt auch Welten/Mods dieser Instanz unwiderruflich.`
    )
    if (!sure) return
    await window.api.deleteInstance(id)
    refreshInstances()
  }

  const settingsInstance = instances.find((i) => i.id === settingsInstanceId) ?? null
  const modsInstance = instances.find((i) => i.id === modsInstanceId) ?? null
  const cloneAsVersionInstance = instances.find((i) => i.id === cloneAsVersionInstanceId) ?? null
  const runningEntries = Object.entries(launches)
  const selectedLaunch = selectedInstanceId ? launches[selectedInstanceId] : undefined

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">E</span>
          <h1>Erqf Launcher</h1>
        </div>
        {!profile ? (
          <button className="primary-button" onClick={handleLogin} disabled={loggingIn}>
            {loggingIn ? 'Anmeldung läuft…' : 'Mit Microsoft anmelden'}
          </button>
        ) : (
          <div className="account">
            Angemeldet als <strong>{profile.name}</strong>
          </div>
        )}
      </header>

      {error && <p className="error">{error}</p>}

      <div className="instance-grid">
        {instances.map((instance) => (
          <InstanceCard
            key={instance.id}
            instance={instance}
            isLaunching={launches[instance.id] !== undefined && !launches[instance.id].closed}
            playDisabled={!profile || (launches[instance.id]?.closed === false)}
            manageDisabled={launches[instance.id] !== undefined && !launches[instance.id].closed}
            onPlay={handlePlay}
            onRename={handleRename}
            onClone={handleClone}
            onCloneAsVersion={setCloneAsVersionInstanceId}
            onDelete={handleDelete}
            onOpenSettings={setSettingsInstanceId}
            onOpenMods={setModsInstanceId}
          />
        ))}

        <button className="instance-card new-instance-card" onClick={() => setShowCreate(true)}>
          + Neue Instanz
        </button>
      </div>

      <button className="import-button" onClick={() => setShowPrismImport(true)}>
        Von Prism Launcher importieren…
      </button>

      {showCreate && (
        <CreateInstanceDialog onCancel={() => setShowCreate(false)} onCreate={handleCreate} />
      )}

      {showPrismImport && (
        <PrismImportDialog onCancel={() => setShowPrismImport(false)} onImported={refreshInstances} />
      )}

      {settingsInstance && (
        <InstanceSettingsDialog
          instance={settingsInstance}
          onCancel={() => setSettingsInstanceId(null)}
          onSave={handleSaveSettings}
        />
      )}

      {modsInstance && (
        <ModBrowserDialog
          instance={modsInstance}
          allInstances={instances}
          onClose={() => setModsInstanceId(null)}
        />
      )}

      {cloneAsVersionInstance && (
        <CloneAsVersionDialog
          instance={cloneAsVersionInstance}
          onCancel={() => setCloneAsVersionInstanceId(null)}
          onClone={handleCloneAsVersion}
        />
      )}

      {runningEntries.length > 0 && (
        <div className="launch-panel">
          <div className="launch-tabs">
            {runningEntries.map(([instanceId, session]) => {
              const instanceName = instances.find((i) => i.id === instanceId)?.name ?? instanceId
              return (
                <button
                  key={instanceId}
                  className={`launch-tab${instanceId === selectedInstanceId ? ' active' : ''}`}
                  onClick={() => setSelectedInstanceId(instanceId)}
                >
                  {instanceName}
                  {session.closed ? ` (beendet: ${session.exitCode})` : ' (läuft)'}
                  <span
                    className="launch-tab-close"
                    onClick={(e) => {
                      e.stopPropagation()
                      dismissLaunch(instanceId)
                    }}
                  >
                    ×
                  </span>
                </button>
              )
            })}
          </div>
          <pre className="log">{selectedLaunch?.logs.join('\n') ?? 'Kein Log ausgewählt.'}</pre>
        </div>
      )}
    </div>
  )
}

export default App
