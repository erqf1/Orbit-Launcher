import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../i18n'
import type { ServerInstance } from '../types'

interface Props {
  server: ServerInstance
  onChanged: () => void
}

// Mirrors the app-shell's inline .launch-panel <pre> log for the client
// launch pipeline, but as its own tab (a hosted server's "window" IS its
// console, there's no separate native game window to show/hide) with an
// added command input wired to the new stdin-write IPC - something the
// client launch path has never needed, since Minecraft-the-client doesn't
// take console commands.
function ServerConsoleTab({ server, onChanged }: Props): React.JSX.Element {
  const { t } = useLocale()
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [command, setCommand] = useState('')
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const logRef = useRef<HTMLPreElement>(null)
  // Guards the mount-time isHostedServerRunning fetch below against a
  // server:closed push event arriving before that fetch resolves - without
  // this, the (now-stale) "still running" response could land after the
  // event already correctly set running=false, flipping it back to true.
  const closedWhileFetchingRef = useRef(false)

  useEffect(() => {
    let cancelled = false
    closedWhileFetchingRef.current = false
    window.api.isHostedServerRunning(server.id).then((value) => {
      if (!cancelled && !closedWhileFetchingRef.current) setRunning(value)
    })
    return () => {
      cancelled = true
    }
  }, [server.id])

  useEffect(() => {
    const offLog = window.api.onServerLog((event) => {
      if (event.serverId !== server.id) return
      setLogs((prev) => [...prev, event.line])
    })
    const offClosed = window.api.onServerClosed((event) => {
      if (event.serverId !== server.id) return
      closedWhileFetchingRef.current = true
      setRunning(false)
      setLogs((prev) => [...prev, `[${t('serverHost.console.exited', { code: event.code })}]`])
    })
    return () => {
      offLog()
      offClosed()
    }
  }, [server.id, t])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight })
  }, [logs])

  async function handleStart(): Promise<void> {
    setError(null)
    setStarting(true)
    try {
      await window.api.startHostedServer(server.id)
      setRunning(true)
      setLogs([])
      onChanged()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setStarting(false)
    }
  }

  async function handleStop(): Promise<void> {
    await window.api.stopHostedServer(server.id)
  }

  async function handleSendCommand(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    const trimmed = command.trim()
    if (!trimmed) return
    setCommand('')
    try {
      await window.api.sendHostedServerCommand(server.id, trimmed)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="detail-tab">
      <div className="detail-tab-header">
        {running ? (
          <button type="button" onClick={handleStop}>
            {t('serverHost.console.stop')}
          </button>
        ) : (
          <button type="button" className="save-button" onClick={handleStart} disabled={starting}>
            {starting ? t('serverHost.console.starting') : t('serverHost.console.start')}
          </button>
        )}
      </div>

      {!server.eulaAccepted && (
        <p className="error">{t('serverHost.console.eulaRequired')}</p>
      )}
      {error && <p className="error">{error}</p>}

      <pre className="log" ref={logRef}>
        {logs.length > 0 ? logs.join('\n') : t('serverHost.console.noLog')}
      </pre>

      <form onSubmit={handleSendCommand} className="server-console-command-row">
        <input
          value={command}
          onChange={(e) => setCommand(e.target.value)}
          placeholder={t('serverHost.console.commandPlaceholder')}
          disabled={!running}
        />
        <button type="submit" disabled={!running || !command.trim()}>
          {t('serverHost.console.send')}
        </button>
      </form>
    </div>
  )
}

export default ServerConsoleTab
