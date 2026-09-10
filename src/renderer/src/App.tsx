import { useCallback, useEffect, useRef, useState } from 'react'
import InstanceCard, { type InstanceViewLayout } from './InstanceCard'
import CreateInstanceDialog from './CreateInstanceDialog'
import CloneAsVersionDialog from './CloneAsVersionDialog'
import InstanceDetailPanel from './detail/InstanceDetailPanel'
import ImportPickerDialog from './ImportPickerDialog'
import ZipImportDialog from './ZipImportDialog'
import PlayitSettingsDialog from './PlayitSettingsDialog'
import AccountSwitcher from './AccountSwitcher'
import LanguageSwitcher from './LanguageSwitcher'
import ServerHostCard from './ServerHostCard'
import CreateServerDialog from './CreateServerDialog'
import ServerHostDetailPanel from './detail/ServerHostDetailPanel'
import CrashDiagnosisBanner from './CrashDiagnosisBanner'
import { useLocale } from './i18n'
import type {
  CloneContentOptions,
  CrashDiagnosis,
  Instance,
  LoaderType,
  PlayitTunnelConfig,
  ServerInstance,
  ServerLoaderType
} from './types'
import logo from './assets/logo.png'
import bgPhoto1 from './assets/bg-photo-1.png'
import bgPhoto2 from './assets/bg-photo-2.png'
import bgPhoto3 from './assets/bg-photo-3.png'
import bgPhoto4 from './assets/bg-photo-4.png'
import bgPhoto6 from './assets/bg-photo-6.png'
import bgPhoto7 from './assets/bg-photo-7.png'
import bgPhoto8 from './assets/bg-photo-8.png'

// Fixed set of bundled backgrounds, cycled via the arrows/dots - no
// user-added custom backgrounds (that feature was removed: reading an
// arbitrary user-picked file back as a data: URL for a CSS background was
// fragile for large photos and not worth the complexity for what's meant
// to be a small fixed set of launcher wallpapers). The snowy one that used
// to be here was dropped per explicit feedback.
const DEFAULT_BACKGROUNDS = [bgPhoto1, bgPhoto2, bgPhoto3, bgPhoto4, bgPhoto6, bgPhoto7, bgPhoto8]

interface Account {
  name: string
  id: string
}

type SortMode = 'name' | 'lastPlayed' | 'created'
type Filter = { type: 'all' } | { type: 'version'; value: string } | { type: 'group'; value: string }
type MainView = 'instances' | 'serverHosting'

const VIEW_MODE_KEY = 'erqf.viewMode'
const SORT_MODE_KEY = 'erqf.sortMode'
const BG_INDEX_KEY = 'erqf.bgIndex'

function readStoredBgIndex(): number {
  try {
    const stored = Number(localStorage.getItem(BG_INDEX_KEY))
    if (Number.isInteger(stored) && stored >= 0) return stored
  } catch {
    // ignore
  }
  return 0
}

function readStoredViewMode(): InstanceViewLayout {
  try {
    const stored = localStorage.getItem(VIEW_MODE_KEY)
    if (stored === 'grid' || stored === 'list') return stored
  } catch {
    // localStorage can throw in restricted contexts - grid is a fine default.
  }
  return 'grid'
}

// Newest-first, numeric-chunk-aware so "1.21.11" sorts above "1.21.2" (a
// plain string sort would put "1.21.11" first alphabetically but that's
// wrong numerically) - falls back to a plain string compare per chunk for
// non-numeric ids like "rd-132211" (an April Fools' snapshot).
function compareVersionsDesc(a: string, b: string): number {
  const partsA = a.match(/\d+|\D+/g) ?? [a]
  const partsB = b.match(/\d+|\D+/g) ?? [b]
  const len = Math.max(partsA.length, partsB.length)
  for (let i = 0; i < len; i++) {
    const x = partsA[i] ?? ''
    const y = partsB[i] ?? ''
    if (/^\d+$/.test(x) && /^\d+$/.test(y)) {
      const diff = Number(y) - Number(x)
      if (diff !== 0) return diff
    } else {
      const diff = y.localeCompare(x)
      if (diff !== 0) return diff
    }
  }
  return 0
}

function readStoredSortMode(): SortMode {
  try {
    const stored = localStorage.getItem(SORT_MODE_KEY)
    if (stored === 'name' || stored === 'lastPlayed' || stored === 'created') return stored
  } catch {
    // ignore
  }
  return 'name'
}

// Keyed by instanceId, not launchId: the backend guarantees at most one
// active launch per instance (different instances may run concurrently,
// the same one can't be started twice), so instanceId is already a unique
// key and there's no need to track launchId on the renderer side at all.
interface LaunchSession {
  logs: string[]
  closed: boolean
  exitCode: number | null
  crashDiagnosis: CrashDiagnosis | null
}

function App(): React.JSX.Element {
  const { t } = useLocale()
  const [activeAccountId, setActiveAccountId] = useState<string | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loggingIn, setLoggingIn] = useState(false)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [instances, setInstances] = useState<Instance[]>([])
  const [launches, setLaunches] = useState<Record<string, LaunchSession>>({})
  const [mainView, setMainView] = useState<MainView>('instances')
  const [servers, setServers] = useState<ServerInstance[]>([])
  const [runningServerIds, setRunningServerIds] = useState<Record<string, boolean>>({})
  const [showCreateServer, setShowCreateServer] = useState(false)
  const [showPlayitSettings, setShowPlayitSettings] = useState(false)
  const [playitTunnelAddress, setPlayitTunnelAddress] = useState<string | null>(null)
  const [playitConfig, setPlayitConfig] = useState<PlayitTunnelConfig | null>(null)
  const [detailServerId, setDetailServerId] = useState<string | null>(null)
  const [selectedInstanceId, setSelectedInstanceId] = useState<string | null>(null)
  const [showCreate, setShowCreate] = useState(false)
  const [detailInstanceId, setDetailInstanceId] = useState<string | null>(null)
  const [cloneAsVersionInstanceId, setCloneAsVersionInstanceId] = useState<string | null>(null)
  const [showImportPicker, setShowImportPicker] = useState(false)
  const [showZipImport, setShowZipImport] = useState(false)
  const [filter, setFilter] = useState<Filter>({ type: 'all' })
  const [viewMode, setViewModeState] = useState<InstanceViewLayout>(readStoredViewMode)
  const [sortMode, setSortModeState] = useState<SortMode>(readStoredSortMode)
  const [bgIndex, setBgIndexState] = useState<number>(readStoredBgIndex)
  const [askOnPlay, setAskOnPlayState] = useState(false)
  const [playPickerInstanceId, setPlayPickerInstanceId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showCat, setShowCat] = useState(false)
  const brandClicksRef = useRef(0)
  const brandClickTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const authRestoreStarted = useRef(false)

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

  // Guards against a stale isHostedServerRunning poll response clobbering a
  // more recent, event-driven update: bumped on every new poll AND every
  // push event, so a poll whose in-flight requests were superseded by
  // either simply discards its own (now-outdated) result instead of
  // overwriting runningServerIds with it.
  const runningPollEpochRef = useRef(0)

  const refreshServers = useCallback(() => {
    window.api.listHostedServers().then(async (list) => {
      setServers(list)
      const epoch = ++runningPollEpochRef.current
      const entries = await Promise.all(
        list.map(async (s) => [s.id, await window.api.isHostedServerRunning(s.id)] as const)
      )
      if (epoch !== runningPollEpochRef.current) return
      setRunningServerIds(Object.fromEntries(entries))
    })
  }, [])

  useEffect(() => {
    refreshServers()
  }, [refreshServers])

  const refreshPlayitConfig = useCallback(() => {
    window.api.getPlayitTunnelConfig().then((config) => {
      setPlayitTunnelAddress(config.publicAddress)
      setPlayitConfig(config)
    })
  }, [])

  useEffect(() => {
    refreshPlayitConfig()
  }, [refreshPlayitConfig])

  useEffect(() => {
    const off = window.api.onServerClosed(({ serverId }) => {
      runningPollEpochRef.current++
      setRunningServerIds((prev) => ({ ...prev, [serverId]: false }))
    })
    return off
  }, [])

  useEffect(() => {
    const off = window.api.onLaunchQuitSuppressed(() => setError(t('launch.quitSuppressedNotice')))
    return off
  }, [t])

  useEffect(() => {
    refreshInstances()
    // Guards against StrictMode's dev-mode double-invoke firing this twice -
    // the backend now dedupes concurrent auth restores too (see
    // ensureAuthorizationFor's inFlightAuth map), but skipping the second
    // call here entirely avoids a wasted round trip on top of that.
    if (authRestoreStarted.current) return
    authRestoreStarted.current = true
    window.api.currentAccount().then((result) => {
      setAccounts(result.accounts)
      if (result.profile) setActiveAccountId(result.profile.id)
      setAskOnPlayState(result.askOnPlay)
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
        const existing = prev[instanceId] ?? { logs: [], closed: false, exitCode: null, crashDiagnosis: null }
        return { ...prev, [instanceId]: { ...existing, logs: [...existing.logs, line] } }
      })
    })
    const offClosed = window.api.onClosed(({ instanceId, code }) => {
      setLaunches((prev) => {
        const existing = prev[instanceId] ?? { logs: [], closed: false, exitCode: null, crashDiagnosis: null }
        return { ...prev, [instanceId]: { ...existing, closed: true, exitCode: code } }
      })
    })
    const offCrashDiagnosis = window.api.onCrashDiagnosis(({ instanceId, diagnosis }) => {
      setLaunches((prev) => {
        const existing = prev[instanceId]
        if (!existing) return prev
        return { ...prev, [instanceId]: { ...existing, crashDiagnosis: diagnosis } }
      })
    })
    return () => {
      offLog()
      offClosed()
      offCrashDiagnosis()
    }
  }, [])

  // Electron/Windows sometimes leaves the window frontmost but without real
  // OS input focus after a native dialog or picker closes - buttons look
  // normal but don't respond until something explicitly refocuses. A
  // capturing-phase listener catches the very first click of a "stuck"
  // window (mouse hit-testing still works even without keyboard focus) and
  // requests focus before that click's own handler runs, healing it in place
  // instead of requiring the user to click twice or alt-tab.
  useEffect(() => {
    const handler = (): void => window.focus()
    document.addEventListener('mousedown', handler, true)
    return () => document.removeEventListener('mousedown', handler, true)
  }, [])

  async function handleLogin(): Promise<void> {
    setError(null)
    setLoggingIn(true)
    try {
      const result = await window.api.login()
      setAccounts(result.accounts)
      if (result.profile) setActiveAccountId(result.profile.id)
      setAskOnPlayState(result.askOnPlay)
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
      setAskOnPlayState(result.askOnPlay)
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
    setAskOnPlayState(result.askOnPlay)
  }

  async function handleToggleAskOnPlay(value: boolean): Promise<void> {
    setAskOnPlayState(value)
    await window.api.setAskOnPlay(value)
  }

  async function launchWithActiveAccount(id: string): Promise<void> {
    setError(null)
    setLaunches((prev) => ({
      ...prev,
      [id]: { logs: [], closed: false, exitCode: null, crashDiagnosis: null }
    }))
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

  async function handlePlay(id: string): Promise<void> {
    if (askOnPlay && accounts.length > 1) {
      setPlayPickerInstanceId(id)
      return
    }
    await launchWithActiveAccount(id)
  }

  async function handlePickAccountForPlay(accountId: string): Promise<void> {
    const instanceId = playPickerInstanceId
    setPlayPickerInstanceId(null)
    if (!instanceId) return
    if (accountId !== activeAccountId) {
      await handleSwitchAccount(accountId)
    }
    await launchWithActiveAccount(instanceId)
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
    loaderVersion: string | undefined,
    contentOptions: CloneContentOptions
  ): Promise<void> {
    const source = instances.find((i) => i.id === id)
    // Nothing about the version/loader actually changed - take the fast,
    // offline exact-copy path instead of reinstalling a loader profile that
    // would just end up identical to what's already there.
    const unchanged =
      !!source &&
      mcVersion === source.mcVersion &&
      loader === source.loader &&
      (loader === 'vanilla' || loaderVersion === (source.loaderVersion ?? undefined))
    if (unchanged) {
      await window.api.cloneInstance(id, contentOptions)
    } else {
      await window.api.cloneInstanceAsVersion(id, { mcVersion, loader, loaderVersion }, contentOptions)
    }
    setCloneAsVersionInstanceId(null)
    refreshInstances()
  }

  async function handleRename(id: string, name: string): Promise<void> {
    await window.api.renameInstance(id, name)
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

  async function handleCreateServer(
    name: string,
    mcVersion: string,
    loader: ServerLoaderType,
    fabricLoaderVersion: string | undefined,
    paperBuildId: number | undefined,
    acceptEula: boolean
  ): Promise<void> {
    await window.api.createHostedServer({ name, mcVersion, loader, fabricLoaderVersion, paperBuildId, acceptEula })
    setShowCreateServer(false)
    refreshServers()
  }

  async function handleRenameServer(id: string, name: string): Promise<void> {
    try {
      await window.api.renameHostedServer(id, name)
      refreshServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  // The shared playit.gg tunnel is now mandatory for hosting, not optional -
  // starting a server without a valid tunnel would leave friends with no way
  // to actually reach it, so this checks fresh (rather than trusting
  // possibly-stale playitConfig state) before ever spawning the server
  // process, and sends the user straight to the one place tunnel config
  // lives instead of starting a server nobody can join.
  async function handleStartServer(id: string): Promise<void> {
    const server = servers.find((s) => s.id === id)
    const config = await window.api.getPlayitTunnelConfig()
    setPlayitConfig(config)
    setPlayitTunnelAddress(config.publicAddress)
    const tunnelValid = !!config.secretKey && (!server || config.localPort === server.serverPort)
    if (!tunnelValid) {
      setError(t('serverHost.tunnelRequiredNotice'))
      setShowPlayitSettings(true)
      return
    }
    try {
      await window.api.startHostedServer(id)
      refreshServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleStopServer(id: string): Promise<void> {
    try {
      await window.api.stopHostedServer(id)
      refreshServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleDeleteServer(id: string): Promise<void> {
    const server = servers.find((s) => s.id === id)
    const label = server ? server.name : t('serverHost.thisServer')
    if (runningServerIds[id]) {
      setError(t('serverHost.deleteWhileRunning', { name: label }))
      return
    }
    const sure = window.confirm(t('serverHost.confirmDelete', { name: label }))
    if (!sure) return
    try {
      await window.api.deleteHostedServer(id)
      refreshServers()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleToggleFavorite(id: string): Promise<void> {
    const instance = instances.find((i) => i.id === id)
    if (!instance) return
    await window.api.updateInstanceSettings(id, { favorite: !instance.favorite })
    refreshInstances()
  }

  async function handleSetGroup(id: string, group: string | null): Promise<void> {
    await window.api.updateInstanceSettings(id, { group })
    refreshInstances()
  }

  async function handleSetCoverColor(id: string, coverColor: string | null): Promise<void> {
    await window.api.updateInstanceSettings(id, { coverColor })
    refreshInstances()
  }

  function setViewMode(mode: InstanceViewLayout): void {
    setViewModeState(mode)
    try {
      localStorage.setItem(VIEW_MODE_KEY, mode)
    } catch {
      // per-viewer convenience only - fine if it can't persist
    }
  }

  function setSortMode(mode: SortMode): void {
    setSortModeState(mode)
    try {
      localStorage.setItem(SORT_MODE_KEY, mode)
    } catch {
      // ignore
    }
  }

  const backgrounds = DEFAULT_BACKGROUNDS

  function setBgIndex(index: number): void {
    const wrapped = (index + backgrounds.length) % backgrounds.length
    setBgIndexState(wrapped)
    try {
      localStorage.setItem(BG_INDEX_KEY, String(wrapped))
    } catch {
      // ignore
    }
  }

  // --bg-photo is read by body's background-image in App.css - set here
  // instead of a static CSS url() so the arrows can switch it live.
  useEffect(() => {
    const clamped = ((bgIndex % backgrounds.length) + backgrounds.length) % backgrounds.length
    document.documentElement.style.setProperty('--bg-photo', `url(${backgrounds[clamped]})`)
  }, [bgIndex])

  const detailInstance = instances.find((i) => i.id === detailInstanceId) ?? null
  const detailServer = servers.find((s) => s.id === detailServerId) ?? null
  const cloneAsVersionInstance = instances.find((i) => i.id === cloneAsVersionInstanceId) ?? null
  const runningEntries = Object.entries(launches)
  const selectedLaunch = selectedInstanceId ? launches[selectedInstanceId] : undefined

  const versionCounts = instances.reduce<Record<string, number>>((acc, i) => {
    acc[i.mcVersion] = (acc[i.mcVersion] ?? 0) + 1
    return acc
  }, {})
  const presentVersions = Object.keys(versionCounts).sort(compareVersionsDesc)

  const groupCounts = instances.reduce<Record<string, number>>((acc, i) => {
    if (i.group) acc[i.group] = (acc[i.group] ?? 0) + 1
    return acc
  }, {})
  const presentGroups = Object.keys(groupCounts).sort((a, b) => a.localeCompare(b))

  const filtered = instances.filter((i) => {
    if (filter.type === 'version') return i.mcVersion === filter.value
    if (filter.type === 'group') return i.group === filter.value
    return true
  })
  const sorted = [...filtered].sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1
    if (sortMode === 'lastPlayed') {
      return (b.lastPlayed ? Date.parse(b.lastPlayed) : 0) - (a.lastPlayed ? Date.parse(a.lastPlayed) : 0)
    }
    if (sortMode === 'created') {
      return Date.parse(b.createdAt) - Date.parse(a.createdAt)
    }
    return a.name.localeCompare(b.name)
  })
  const visibleInstances = sorted

  const filterLabel = filter.type === 'all' ? t('instances.title') : filter.value

  return (
    <div className="app-shell">
      <aside className="main-sidebar">
        <div className="brand">
          <span className="brand-mark" onClick={handleBrandClick}>
            <img src={logo} alt="" />
          </span>
          <h1>{t('app.title')}</h1>
        </div>

        <div className="view-mode-switch main-view-switch">
          <button
            type="button"
            className={mainView === 'instances' ? 'active' : ''}
            onClick={() => {
              setMainView('instances')
              setError(null)
            }}
          >
            {t('nav.instancesView')}
          </button>
          <button
            type="button"
            className={mainView === 'serverHosting' ? 'active' : ''}
            onClick={() => {
              setMainView('serverHosting')
              setError(null)
            }}
          >
            {t('nav.serverHostingView')}
          </button>
        </div>

        {mainView === 'instances' && (
        <>
        <nav>
          <button
            type="button"
            className={`main-nav-item${filter.type === 'all' ? ' active' : ''}`}
            onClick={() => setFilter({ type: 'all' })}
          >
            {t('nav.allInstances')}
            <span className="main-nav-count">{instances.length}</span>
          </button>
          {presentVersions.map((version) => (
            <button
              key={version}
              type="button"
              className={`main-nav-item${filter.type === 'version' && filter.value === version ? ' active' : ''}`}
              onClick={() => setFilter({ type: 'version', value: version })}
            >
              {version}
              <span className="main-nav-count">{versionCounts[version]}</span>
            </button>
          ))}
        </nav>

        {presentGroups.length > 0 && (
          <>
            <p className="main-sidebar-section-label">{t('nav.groups')}</p>
            <nav>
              {presentGroups.map((group) => (
                <button
                  key={group}
                  type="button"
                  className={`main-nav-item${filter.type === 'group' && filter.value === group ? ' active' : ''}`}
                  onClick={() => setFilter({ type: 'group', value: group })}
                >
                  {group}
                  <span className="main-nav-count">{groupCounts[group]}</span>
                </button>
              ))}
            </nav>
          </>
        )}

        <p className="main-sidebar-section-label">{t('nav.sortLabel')}</p>
        <select
          className="main-sidebar-sort"
          value={sortMode}
          onChange={(e) => setSortMode(e.target.value as SortMode)}
        >
          <option value="name">{t('sort.name')}</option>
          <option value="lastPlayed">{t('sort.lastPlayed')}</option>
          <option value="created">{t('sort.created')}</option>
        </select>
        </>
        )}

        <div className="main-sidebar-footer">
          <LanguageSwitcher />
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
              askOnPlay={askOnPlay}
              onToggleAskOnPlay={handleToggleAskOnPlay}
            />
          )}
        </div>
      </aside>

      <div className="app-main">
        {mainView === 'instances' && (
        <>
        <div className="app-main-header">
          <h2>{filterLabel}</h2>
          <div className="view-mode-switch">
            <button
              type="button"
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              title={`${t('view.grid')}${t('view.default')}`}
            >
              ▦ {t('view.grid')}
              {t('view.default')}
            </button>
            <button
              type="button"
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              title={t('view.list')}
            >
              ☰ {t('view.list')}
            </button>
          </div>
        </div>

        {error && <p className="error">{error}</p>}

        <div className={`instance-grid view-${viewMode}`}>
          {visibleInstances.map((instance) => (
            <InstanceCard
              key={instance.id}
              instance={instance}
              layout={viewMode}
              isLaunching={launches[instance.id] !== undefined && !launches[instance.id].closed}
              playDisabled={!activeAccountId || (launches[instance.id]?.closed === false)}
              manageDisabled={launches[instance.id] !== undefined && !launches[instance.id].closed}
              onPlay={handlePlay}
              onRename={handleRename}
              onCloneAsVersion={setCloneAsVersionInstanceId}
              onDelete={handleDelete}
              onManage={setDetailInstanceId}
              onIconChanged={refreshInstances}
              onToggleFavorite={handleToggleFavorite}
              onSetGroup={handleSetGroup}
              onSetCoverColor={handleSetCoverColor}
            />
          ))}

          <button className="instance-card new-instance-card" onClick={() => setShowCreate(true)}>
            {t('instances.new')}
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
                    {session.closed
                      ? ` (${t('launch.exited', { code: String(session.exitCode) })})`
                      : ` (${t('launch.running')})`}
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
            <pre className="log">{selectedLaunch?.logs.join('\n') ?? t('launch.noLogSelected')}</pre>
            {selectedLaunch?.closed &&
              selectedLaunch.exitCode !== 0 &&
              selectedLaunch.crashDiagnosis &&
              selectedInstanceId &&
              (() => {
                const crashedInstance = instances.find((i) => i.id === selectedInstanceId)
                if (!crashedInstance) return null
                return (
                  <CrashDiagnosisBanner
                    instance={crashedInstance}
                    diagnosis={selectedLaunch.crashDiagnosis}
                    onFixed={() => {
                      setLaunches((prev) => {
                        const existing = prev[selectedInstanceId]
                        if (!existing) return prev
                        return { ...prev, [selectedInstanceId]: { ...existing, crashDiagnosis: null } }
                      })
                      refreshInstances()
                    }}
                  />
                )
              })()}
          </div>
        )}
        </>
        )}

        {mainView === 'serverHosting' && (
          <>
            <div className="app-main-header">
              <h2>{t('nav.serverHostingView')}</h2>
              <button type="button" onClick={() => setShowPlayitSettings(true)}>
                {t('playitSettings.openButton')}
              </button>
            </div>

            {error && <p className="error">{error}</p>}

            <div className="instance-grid view-grid">
              {servers.map((server) => (
                <ServerHostCard
                  key={server.id}
                  server={server}
                  isRunning={!!runningServerIds[server.id]}
                  tunnelHasAddress={!!playitTunnelAddress}
                  onManage={setDetailServerId}
                  onRename={handleRenameServer}
                  onDelete={handleDeleteServer}
                  onStart={handleStartServer}
                  onStop={handleStopServer}
                  onIconChanged={refreshServers}
                />
              ))}

              <button className="instance-card new-instance-card" onClick={() => setShowCreateServer(true)}>
                {t('serverHost.new')}
              </button>
            </div>
          </>
        )}
      </div>

      {showCreate && (
        <CreateInstanceDialog
          onCancel={() => setShowCreate(false)}
          onCreate={handleCreate}
          presetVersion={filter.type === 'version' ? filter.value : undefined}
          onImportInstead={() => {
            setShowCreate(false)
            setShowImportPicker(true)
          }}
          onImportZip={() => {
            setShowCreate(false)
            setShowZipImport(true)
          }}
        />
      )}

      {showImportPicker && (
        <ImportPickerDialog onCancel={() => setShowImportPicker(false)} onImported={refreshInstances} />
      )}

      {showZipImport && (
        <ZipImportDialog onCancel={() => setShowZipImport(false)} onImported={refreshInstances} />
      )}

      {showPlayitSettings && (
        <PlayitSettingsDialog
          onCancel={() => setShowPlayitSettings(false)}
          onChanged={refreshPlayitConfig}
        />
      )}

      {showCreateServer && (
        <CreateServerDialog onCancel={() => setShowCreateServer(false)} onCreate={handleCreateServer} />
      )}

      {detailServer && (
        <ServerHostDetailPanel
          server={detailServer}
          onClose={() => setDetailServerId(null)}
          onServerChanged={refreshServers}
        />
      )}

      {detailInstance && (
        <InstanceDetailPanel
          instance={detailInstance}
          accounts={accounts}
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

      {playPickerInstanceId && (
        <div className="modal-backdrop" onClick={() => setPlayPickerInstanceId(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{t('account.pickForPlay')}</h2>
            <div className="play-account-picker">
              {accounts.map((account) => (
                <button
                  key={account.id}
                  type="button"
                  className="play-account-picker-item"
                  onClick={() => handlePickAccountForPlay(account.id)}
                >
                  {account.name}
                </button>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setPlayPickerInstanceId(null)}>
                {t('common.cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showCat && (
        <div className="hidden-cat">
          <pre>{' /\\_/\\\n( o.o )\n > ^ <'}</pre>
          <span>Mrau!</span>
        </div>
      )}

      <div className="bg-switcher">
        <button
          type="button"
          className="bg-switcher-arrow"
          onClick={() => setBgIndex(bgIndex - 1)}
          title={t('background.previous')}
        >
          ‹
        </button>
        <div className="bg-switcher-dots">
          {backgrounds.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`bg-switcher-dot${i === bgIndex ? ' active' : ''}`}
              onClick={() => setBgIndex(i)}
              title={t('background.numbered', { number: String(i + 1) })}
            />
          ))}
        </div>
        <button
          type="button"
          className="bg-switcher-arrow"
          onClick={() => setBgIndex(bgIndex + 1)}
          title={t('background.next')}
        >
          ›
        </button>
      </div>
    </div>
  )
}

export default App
