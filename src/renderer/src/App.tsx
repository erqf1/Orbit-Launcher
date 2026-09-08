import { useCallback, useEffect, useRef, useState } from 'react'
import InstanceCard from './InstanceCard'
import CreateInstanceDialog from './CreateInstanceDialog'
import CloneAsVersionDialog from './CloneAsVersionDialog'
import InstanceDetailPanel from './detail/InstanceDetailPanel'
import PrismImportDialog from './PrismImportDialog'
import AccountSwitcher from './AccountSwitcher'
import type { Instance, LoaderType } from './types'

interface Account {
  name: string
  id: string
}

const LOADER_LABELS: Record<LoaderType, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  legacyfabric: 'Legacy Fabric',
  forge: 'Forge',
  neoforge: 'NeoForge'
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
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loggingIn, setLoggingIn] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [instances, setInstances] = useState<Instance[]>([])
  const [launches, setLaunches] = useState<Record<string, LaunchSession>>({})
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [detailInstanceId, setDetailInstanceId] = useState<string | null>(null)
  const [cloneAsVersionInstanceId, setCloneAsVersionInstanceId] = useState<string | null>(null)
  const [showPrismImport, setShowPrismImport] = useState(false)
  const [loaderFilter, setLoaderFilter] = useState<LoaderType | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [showCat, setShowCat] = useState(false)
  const brandClicksRef = useRef(0)
  const brandClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hidden easter egg, on a friend's recommendation - five clicks on the
  // brand mark within two seconds reveals a cat for a few seconds.
  function handleBrandClick(): void {
    brandClicksRef.current += 1
    if (brandClickTimerRef.current) clearTimeout(brandClickTimerRef.current)
    brandClickTimerRef.current = setTimeout(() => {
      brandClicksRef.current = 0
    }, 2000)

    if (brandClicksRef.current >= 5) {
      brandClicksRef.current = 0
      setShowCat(true)
      setTimeout(() => setShowCat(false), 4000)
    }
  }

  const refreshInstances = useCallback(() => {
    window.api.listInstances().then(setInstances)
  }, [])

  useEffect(() => {
    refreshInstances()
    window.api.currentAccount().then((result) => {
      setAccounts(result.accounts)
      if (result.profile) setActiveAccountId(result.profile.id)
      // A desktop shortcut re-launches the whole app with a pending instance
      // id (see createDesktopShortcut/setPendingLaunchInstanceIdFromArgv) -
      // only consumed once auth is known, so this doesn't race the login
      // restore and immediately fail with "not logged in".
      window.api.consumePendingLaunchInstanceId().then((pendingId) => {
        if (pendingId) handlePlay(pendingId)
      })
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
      setAccounts(result.accounts)
      if (result.profile) setActiveAccountId(result.profile.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoggingIn(false)
    }
  }

  async function handleSwitchAccount(id: string): Promise<void> {
    setError(null)
    setSwitchingAccount(true)
    try {
      const result = await window.api.switchAccount(id)
      setAccounts(result.accounts)
      setActiveAccountId(result.profile?.id ?? null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSwitchingAccount(false)
    }
  }

  async function handleRemoveAccount(id: string): Promise<void> {
    const account = accounts.find((a) => a.id === id)
    const sure = window.confirm(`Konto "${account?.name ?? id}" wirklich entfernen?`)
    if (!sure) return
    setError(null)
    const result = await window.api.removeAccount(id)
    setAccounts(result.accounts)
    setActiveAccountId(result.profile?.id ?? null)
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
    loaderVersion: string | undefined,
    installRecommendedMods: boolean
  ): Promise<void> {
    const instance = await window.api.createInstance({ name, mcVersion, loader, loaderVersion })
    setShowCreate(false)
    refreshInstances()

    if (installRecommendedMods) {
      // Best-effort: a curated mod failing to install shouldn't block the
      // instance the user just successfully created from showing up.
      try {
        const curated = await window.api.listCuratedMods(mcVersion, loader)
        for (const mod of curated.filter((m) => m.compatible)) {
          const versions = await window.api.listModVersions(mod.projectId, mcVersion, loader)
          const best = versions[0]
          if (best) await window.api.installMod(instance.id, { url: best.url, filename: best.filename })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    }
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

  const detailInstance = instances.find((i) => i.id === detailInstanceId) ?? null
  const cloneAsVersionInstance = instances.find((i) => i.id === cloneAsVersionInstanceId) ?? null
  const runningEntries = Object.entries(launches)
  const selectedLaunch = selectedInstanceId ? launches[selectedInstanceId] : undefined

  const loaderCounts = instances.reduce<Partial<Record<LoaderType, number>>>((acc, i) => {
    acc[i.loader] = (acc[i.loader] ?? 0) + 1
    return acc
  }, {})
  const presentLoaders = (Object.keys(loaderCounts) as LoaderType[]).filter((l) => l !== 'vanilla')
  const visibleInstances =
    loaderFilter === 'all' ? instances : instances.filter((i) => i.loader === loaderFilter)

  return (
    <div className="app-shell">
      <aside className="main-sidebar">
        <div className="brand">
          <span className="brand-mark" onClick={handleBrandClick}>
            E
          </span>
          <h1>Erqf Launcher</h1>
        </div>

        <nav>
          <button
            type="button"
            className={`main-nav-item${loaderFilter === 'all' ? ' active' : ''}`}
            onClick={() => setLoaderFilter('all')}
          >
            Alle Instanzen
            <span className="main-nav-count">{instances.length}</span>
          </button>
          {loaderCounts.vanilla !== undefined && (
            <button
              type="button"
              className={`main-nav-item${loaderFilter === 'vanilla' ? ' active' : ''}`}
              onClick={() => setLoaderFilter('vanilla')}
            >
              <span className="main-nav-dot loader-vanilla" />
              Vanilla
              <span className="main-nav-count">{loaderCounts.vanilla}</span>
            </button>
          )}
          {presentLoaders.map((loader) => (
            <button
              key={loader}
              type="button"
              className={`main-nav-item${loaderFilter === loader ? ' active' : ''}`}
              onClick={() => setLoaderFilter(loader)}
            >
              <span className={`main-nav-dot loader-${loader}`} />
              {LOADER_LABELS[loader]}
              <span className="main-nav-count">{loaderCounts[loader]}</span>
            </button>
          ))}
        </nav>

        <div className="main-sidebar-footer">
          <button type="button" onClick={() => setShowPrismImport(true)}>
            Von Prism Launcher importieren…
          </button>
          {accounts.length === 0 ? (
            <button className="primary-button" onClick={handleLogin} disabled={loggingIn}>
              {loggingIn ? 'Anmeldung läuft…' : 'Mit Microsoft anmelden'}
            </button>
          ) : (
            <AccountSwitcher
              activeId={activeAccountId}
              accounts={accounts}
              onSwitch={handleSwitchAccount}
              onRemove={handleRemoveAccount}
              onAddAccount={handleLogin}
              busy={switchingAccount || loggingIn}
            />
          )}
        </div>
      </aside>

      <div className="app-main">
        <div className="app-main-header">
          <h2>{loaderFilter === 'all' ? 'Instanzen' : LOADER_LABELS[loaderFilter]}</h2>
        </div>

        {error && <p className="error">{error}</p>}

        <div className="instance-grid">
          {visibleInstances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              isLaunching={launches[instance.id] !== undefined && !launches[instance.id].closed}
              playDisabled={!activeAccountId || (launches[instance.id]?.closed === false)}
              manageDisabled={launches[instance.id] !== undefined && !launches[instance.id].closed}
              onPlay={handlePlay}
              onRename={handleRename}
              onClone={handleClone}
              onCloneAsVersion={setCloneAsVersionInstanceId}
              onDelete={handleDelete}
              onManage={setDetailInstanceId}
              onIconChanged={refreshInstances}
            />
          ))}

          <button className="instance-card new-instance-card" onClick={() => setShowCreate(true)}>
            + Neue Instanz
          </button>
        </div>

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

      {showCreate && (
        <CreateInstanceDialog onCancel={() => setShowCreate(false)} onCreate={handleCreate} />
      )}

      {showPrismImport && (
        <PrismImportDialog onCancel={() => setShowPrismImport(false)} onImported={refreshInstances} />
      )}

      {detailInstance && (
        <InstanceDetailPanel
          instance={detailInstance}
          allInstances={instances}
          onClose={() => setDetailInstanceId(null)}
          onInstanceChanged={refreshInstances}
        />
      )}

      {cloneAsVersionInstance && (
        <CloneAsVersionDialog
          instance={cloneAsVersionInstance}
          onCancel={() => setCloneAsVersionInstanceId(null)}
          onClone={handleCloneAsVersion}
        />
      )}

      {showCat && (
        <div className="hidden-cat">
          <pre>{' /\\_/\\\n( o.o )\n > ^ <'}</pre>
          <span>Mrau!</span>
        </div>
      )}
    </div>
  )
}

export default App
