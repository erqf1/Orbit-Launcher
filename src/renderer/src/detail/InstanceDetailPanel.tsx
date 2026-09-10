import { useEffect, useState } from 'react'
import { useLocale } from '../i18n'
import type { Instance, InstanceSettingsPatch, JavaCompatCheck, JavaInstallation } from '../types'
import VersionTab from './VersionTab'
import ModsTab from './ModsTab'
import FileListTab from './FileListTab'
import ScreenshotsTab from './ScreenshotsTab'
import WorldsTab from './WorldsTab'
import ServersTab from './ServersTab'
import LogsTab from './LogsTab'

interface Account {
  id: string
  name: string
}

interface Props {
  instance: Instance
  accounts: Account[]
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
  | 'general'
  | 'advanced'
  | 'logs'

const PRIMARY_TABS: TabKey[] = [
  'version',
  'mods',
  'resourcepacks',
  'shaderpacks',
  'notes',
  'worlds',
  'servers',
  'screenshots'
]

// Grouped under one collapsible "Settings" entry instead of three flat
// top-level tabs - these are the ones a user opens far less often than the
// content tabs above, so folding them away by default keeps the nav short.
const SETTINGS_TABS: TabKey[] = ['general', 'advanced', 'logs']

function formatPlaytime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  if (hours === 0) return `${minutes} Min.`
  return `${hours} Std. ${minutes} Min.`
}

function NotesTab({ instance, onSaved }: { instance: Instance; onSaved: () => void }): React.JSX.Element {
  const { t } = useLocale()
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
        placeholder={t('notes.placeholder')}
      />
      {saving && <p className="instance-meta">{t('notes.saving')}</p>}
    </div>
  )
}

function GeneralTab({
  instance,
  accounts,
  onSaved
}: {
  instance: Instance
  accounts: Account[]
  onSaved: () => void
}): React.JSX.Element {
  const { t } = useLocale()
  const [javaOptions, setJavaOptions] = useState<JavaInstallation[]>([])
  const [loadingJava, setLoadingJava] = useState(true)
  const [javaPath, setJavaPath] = useState(instance.javaPath ?? '')
  const [memoryMin, setMemoryMin] = useState(instance.memoryMin)
  const [memoryMax, setMemoryMax] = useState(instance.memoryMax)
  const [windowWidth, setWindowWidth] = useState(instance.windowWidth?.toString() ?? '')
  const [windowHeight, setWindowHeight] = useState(instance.windowHeight?.toString() ?? '')
  const [fullscreen, setFullscreen] = useState(instance.fullscreen)
  const [closeOnLaunch, setCloseOnLaunch] = useState(instance.closeOnLaunch)
  const [quitAppOnGameClose, setQuitAppOnGameClose] = useState(instance.quitAppOnGameClose)
  const [trackPlaytime, setTrackPlaytime] = useState(instance.trackPlaytime)
  const [overrideAccount, setOverrideAccount] = useState(instance.overrideAccountId !== null)
  const [overrideAccountId, setOverrideAccountId] = useState(instance.overrideAccountId ?? '')
  const [autoJoinEnabled, setAutoJoinEnabled] = useState(!!instance.autoJoinServer)
  const [autoJoinServer, setAutoJoinServer] = useState(instance.autoJoinServer ?? '')
  const [skipJavaCompatWarning, setSkipJavaCompatWarning] = useState(instance.skipJavaCompatWarning)
  const [compat, setCompat] = useState<JavaCompatCheck | null>(null)
  const [browsingJava, setBrowsingJava] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  useEffect(() => {
    let cancelled = false
    window.api.checkJavaCompat(javaPath, instance.mcVersion).then((result) => {
      if (!cancelled) setCompat(result)
    })
    return () => {
      cancelled = true
    }
  }, [javaPath, instance.mcVersion])

  async function handleBrowseJava(): Promise<void> {
    setBrowsingJava(true)
    setError(null)
    try {
      const result = await window.api.browseForJava()
      if (result) {
        setJavaPath(result.path)
        setJavaOptions((prev) => (prev.some((j) => j.path === result.path) ? prev : [...prev, result]))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBrowsingJava(false)
    }
  }

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
      memoryMin,
      memoryMax,
      windowWidth: windowWidth ? Number(windowWidth) : null,
      windowHeight: windowHeight ? Number(windowHeight) : null,
      fullscreen,
      closeOnLaunch,
      quitAppOnGameClose,
      trackPlaytime,
      overrideAccountId: overrideAccount ? overrideAccountId || null : null,
      autoJoinServer: autoJoinEnabled ? autoJoinServer.trim() || null : null,
      skipJavaCompatWarning
    }
    await window.api.updateInstanceSettings(instance.id, patch)
    onSaved()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="detail-tab">
      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.gameWindow')}</h4>
        <div className="field-row">
          <label>
            {t('settings.windowWidth')}
            <input
              type="number"
              value={windowWidth}
              onChange={(e) => setWindowWidth(e.target.value)}
              placeholder={t('settings.defaultPlaceholder')}
              disabled={fullscreen}
            />
          </label>
          <label>
            {t('settings.windowHeight')}
            <input
              type="number"
              value={windowHeight}
              onChange={(e) => setWindowHeight(e.target.value)}
              placeholder={t('settings.defaultPlaceholder')}
              disabled={fullscreen}
            />
          </label>
        </div>

        <label className="checkbox-label">
          <input type="checkbox" checked={fullscreen} onChange={(e) => setFullscreen(e.target.checked)} />
          {t('settings.fullscreen')}
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={closeOnLaunch}
            onChange={(e) => setCloseOnLaunch(e.target.checked)}
          />
          {t('settings.hideWhileRunning')}
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={quitAppOnGameClose}
            onChange={(e) => setQuitAppOnGameClose(e.target.checked)}
          />
          {t('settings.quitOnClose')}
        </label>
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.playtime')}</h4>
        <p className="instance-meta">{t('settings.playtimeTotal', { time: formatPlaytime(instance.totalPlaytimeMs) })}</p>
        <label className="checkbox-label">
          <input type="checkbox" checked={trackPlaytime} onChange={(e) => setTrackPlaytime(e.target.checked)} />
          {t('settings.trackPlaytime')}
        </label>
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.accountAndServer')}</h4>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={overrideAccount}
            onChange={(e) => setOverrideAccount(e.target.checked)}
          />
          {t('settings.overrideAccount')}
        </label>
        {overrideAccount && (
          <select value={overrideAccountId} onChange={(e) => setOverrideAccountId(e.target.value)}>
            <option value="">{t('settings.chooseAccount')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        )}

        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={autoJoinEnabled}
            onChange={(e) => setAutoJoinEnabled(e.target.checked)}
          />
          {t('settings.autoJoin')}
        </label>
        {autoJoinEnabled && (
          <input
            value={autoJoinServer}
            onChange={(e) => setAutoJoinServer(e.target.value)}
            placeholder={t('settings.autoJoinPlaceholder')}
          />
        )}
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.javaAndMemory')}</h4>
        <label>
          {t('settings.javaInstallation')}
          {loadingJava ? (
            <p className="instance-meta">{t('settings.searchingJava')}</p>
          ) : (
            <select value={javaPath} onChange={(e) => setJavaPath(e.target.value)}>
              <option value="">{t('settings.systemDefaultJava')}</option>
              {javaOptions.map((j) => (
                <option key={j.path} value={j.path}>
                  {j.version} — {j.path}
                </option>
              ))}
            </select>
          )}
        </label>
        <button type="button" onClick={handleBrowseJava} disabled={browsingJava}>
          {browsingJava ? '…' : t('settings.browse')}
        </button>

        {compat?.mismatch && !skipJavaCompatWarning && (
          <p className="error">
            {t('settings.javaMismatchWarning', {
              installed: String(compat.installedMajor),
              mcVersion: instance.mcVersion,
              required: String(compat.requiredMajor)
            })}
          </p>
        )}
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={skipJavaCompatWarning}
            onChange={(e) => setSkipJavaCompatWarning(e.target.checked)}
          />
          {t('settings.skipJavaWarning')}
        </label>

        <div className="field-row">
          <label>
            {t('settings.memoryMin')}
            <input value={memoryMin} onChange={(e) => setMemoryMin(e.target.value)} placeholder="2G" />
          </label>
          <label>
            {t('settings.memoryMax')}
            <input value={memoryMax} onChange={(e) => setMemoryMax(e.target.value)} placeholder="4G" />
          </label>
        </div>
        {!memoryValid && <p className="error">{t('settings.memoryFormatError')}</p>}
      </section>

      {error && <p className="error">{error}</p>}

      <div className="modal-actions">
        <button type="button" className="save-button" onClick={handleSave} disabled={!memoryValid}>
          {t('common.save')}
        </button>
        {saved && <span className="instance-meta">{t('common.saved')}</span>}
      </div>
    </div>
  )
}

function AdvancedTab({
  instance,
  onSaved
}: {
  instance: Instance
  onSaved: () => void
}): React.JSX.Element {
  const { t } = useLocale()
  const [jvmArgs, setJvmArgs] = useState(instance.jvmArgs ?? '')
  const [mcArgs, setMcArgs] = useState(instance.mcArgs ?? '')
  const [preLaunchCommand, setPreLaunchCommand] = useState(instance.preLaunchCommand ?? '')
  const [postExitCommand, setPostExitCommand] = useState(instance.postExitCommand ?? '')
  const [envVars, setEnvVars] = useState(instance.envVars)
  const [saved, setSaved] = useState(false)

  function updateEnvVar(index: number, field: 'name' | 'value', value: string): void {
    setEnvVars((prev) => prev.map((v, i) => (i === index ? { ...v, [field]: value } : v)))
  }

  function addEnvVar(): void {
    setEnvVars((prev) => [...prev, { name: '', value: '' }])
  }

  function removeEnvVar(index: number): void {
    setEnvVars((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSave(): Promise<void> {
    const patch: InstanceSettingsPatch = {
      jvmArgs: jvmArgs.trim() || null,
      mcArgs: mcArgs.trim() || null,
      preLaunchCommand: preLaunchCommand.trim() || null,
      postExitCommand: postExitCommand.trim() || null,
      envVars: envVars.filter((v) => v.name.trim())
    }
    await window.api.updateInstanceSettings(instance.id, patch)
    onSaved()
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="detail-tab">
      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.arguments')}</h4>
        <label>
          {t('settings.jvmArgs')}
          <input
            value={jvmArgs}
            onChange={(e) => setJvmArgs(e.target.value)}
            placeholder={t('settings.jvmArgsPlaceholder')}
          />
        </label>
        <label>
          {t('settings.mcArgs')}
          <input
            value={mcArgs}
            onChange={(e) => setMcArgs(e.target.value)}
            placeholder={t('settings.optionalPlaceholder')}
          />
        </label>
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.customCommands')}</h4>
        <label>
          {t('settings.preLaunch')}
          <input
            value={preLaunchCommand}
            onChange={(e) => setPreLaunchCommand(e.target.value)}
            placeholder={t('settings.optionalPlaceholder')}
          />
        </label>
        <label>
          {t('settings.postExit')}
          <input
            value={postExitCommand}
            onChange={(e) => setPostExitCommand(e.target.value)}
            placeholder={t('settings.optionalPlaceholder')}
          />
        </label>
        <p className="instance-meta">{t('settings.envVarHelp')}</p>
      </section>

      <section className="settings-section">
        <h4 className="settings-section-title">{t('settings.envVars')}</h4>
        {envVars.length > 0 && (
          <div className="env-var-list">
            {envVars.map((v, i) => (
              <div className="env-var-row" key={i}>
                <input
                  value={v.name}
                  onChange={(e) => updateEnvVar(i, 'name', e.target.value)}
                  placeholder={t('settings.envVarNamePlaceholder')}
                />
                <input
                  value={v.value}
                  onChange={(e) => updateEnvVar(i, 'value', e.target.value)}
                  placeholder={t('settings.envVarValuePlaceholder')}
                />
                <button type="button" onClick={() => removeEnvVar(i)} title={t('common.delete')}>
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
        <button type="button" onClick={addEnvVar}>
          {t('settings.addEnvVar')}
        </button>
      </section>

      <div className="modal-actions">
        <button type="button" className="save-button" onClick={handleSave}>
          {t('common.save')}
        </button>
        {saved && <span className="instance-meta">{t('common.saved')}</span>}
      </div>
    </div>
  )
}

function tabLabel(t: ReturnType<typeof useLocale>['t'], key: TabKey): string {
  switch (key) {
    case 'version':
      return t('tabs.version')
    case 'mods':
      return t('tabs.mods')
    case 'resourcepacks':
      return t('tabs.resourcePacks')
    case 'shaderpacks':
      return t('tabs.shaderPacks')
    case 'notes':
      return t('tabs.notes')
    case 'worlds':
      return t('tabs.worlds')
    case 'servers':
      return t('tabs.servers')
    case 'screenshots':
      return t('tabs.screenshots')
    case 'general':
      return t('settings.general')
    case 'advanced':
      return t('settings.advanced')
    case 'logs':
      return t('tabs.logs')
  }
}

function InstanceDetailPanel({ instance, accounts, onClose, onInstanceChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [tab, setTab] = useState<TabKey>('version')
  const [settingsExpanded, setSettingsExpanded] = useState(false)
  const [editingName, setEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(instance.name)

  // Keeps the group open if the active tab is ever one of its children -
  // not reachable today (nothing deep-links into general/advanced/logs
  // yet), but cheap insurance against the active tab being hidden behind
  // a collapsed group if that ever changes.
  useEffect(() => {
    if (SETTINGS_TABS.some((key) => key === tab)) setSettingsExpanded(true)
  }, [tab])

  useEffect(() => {
    setNameDraft(instance.name)
  }, [instance.name])

  async function confirmRename(): Promise<void> {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== instance.name) {
      await window.api.renameInstance(instance.id, trimmed)
      onInstanceChanged()
    } else {
      setNameDraft(instance.name)
    }
    setEditingName(false)
  }

  function renderTab(): React.JSX.Element {
    switch (tab) {
      case 'version':
        return <VersionTab instance={instance} onChanged={onInstanceChanged} />
      case 'mods':
        return <ModsTab instance={instance} />
      case 'resourcepacks':
        return (
          <FileListTab
            instanceId={instance.id}
            subfolder="resourcepacks"
            addLabel={t('content.addFileLabel')}
            emptyLabel={t('resourcePacks.emptyLabel')}
            browse={{
              instance,
              subfolder: 'resourcepacks',
              projectType: 'resourcepack',
              title: t('resourcePacks.browseTitle')
            }}
          />
        )
      case 'shaderpacks':
        return (
          <FileListTab
            instanceId={instance.id}
            subfolder="shaderpacks"
            addLabel={t('content.addFileLabel')}
            emptyLabel={t('shaderPacks.emptyLabel')}
            browse={{
              instance,
              subfolder: 'shaderpacks',
              projectType: 'shader',
              title: t('shaderPacks.browseTitle')
            }}
          />
        )
      case 'notes':
        return <NotesTab instance={instance} onSaved={onInstanceChanged} />
      case 'worlds':
        return <WorldsTab instanceId={instance.id} />
      case 'servers':
        return <ServersTab instance={instance} onChanged={onInstanceChanged} />
      case 'screenshots':
        return <ScreenshotsTab instanceId={instance.id} />
      case 'general':
        return <GeneralTab instance={instance} accounts={accounts} onSaved={onInstanceChanged} />
      case 'advanced':
        return <AdvancedTab instance={instance} onSaved={onInstanceChanged} />
      case 'logs':
        return <LogsTab instanceId={instance.id} />
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="instance-detail" onClick={(e) => e.stopPropagation()}>
        <div className="instance-detail-sidebar">
          {editingName ? (
            <input
              className="rename-input instance-detail-name-input"
              value={nameDraft}
              autoFocus
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={confirmRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') confirmRename()
                if (e.key === 'Escape') {
                  setNameDraft(instance.name)
                  setEditingName(false)
                }
              }}
            />
          ) : (
            <h2 onDoubleClick={() => setEditingName(true)} title={t('detail.renameTooltip')}>
              {instance.name}
            </h2>
          )}
          <nav>
            {PRIMARY_TABS.map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                className={`instance-detail-nav-item${tab === tabKey ? ' active' : ''}`}
                onClick={() => setTab(tabKey)}
                disabled={tabKey === 'mods' && instance.loader === 'vanilla'}
              >
                {tabLabel(t, tabKey)}
              </button>
            ))}

            <button
              type="button"
              className="instance-detail-nav-item instance-detail-nav-group"
              onClick={() => setSettingsExpanded((v) => !v)}
            >
              <span className={`instance-detail-nav-caret${settingsExpanded ? ' open' : ''}`}>▸</span>
              {t('common.settings')}
            </button>
            {settingsExpanded &&
              SETTINGS_TABS.map((tabKey) => (
                <button
                  key={tabKey}
                  type="button"
                  className={`instance-detail-nav-item instance-detail-nav-subitem${tab === tabKey ? ' active' : ''}`}
                  onClick={() => setTab(tabKey)}
                >
                  {tabLabel(t, tabKey)}
                </button>
              ))}
          </nav>
          <button
            type="button"
            className="instance-detail-open-folder"
            onClick={() => window.api.openInstanceFolder(instance.id)}
          >
            {t('detail.openInstanceFolder')}
          </button>
          <button type="button" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
        <div className="instance-detail-content">{renderTab()}</div>
      </div>
    </div>
  )
}

export default InstanceDetailPanel
