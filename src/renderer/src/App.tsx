import { useEffect, useState } from 'react'

interface Profile {
  name: string
  id: string
}

function App(): React.JSX.Element {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [launching, setLaunching] = useState(false)
  const [logs, setLogs] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const offLog = window.api.onLog((line) => setLogs((prev) => [...prev, line]))
    const offClosed = window.api.onClosed(() => setLaunching(false))
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

  async function handlePlay(): Promise<void> {
    setError(null)
    setLaunching(true)
    setLogs([])
    try {
      await window.api.launch()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setLaunching(false)
    }
  }

  return (
    <div className="app">
      <h1>Erqf Launcher</h1>

      {!profile ? (
        <button onClick={handleLogin} disabled={loggingIn}>
          {loggingIn ? 'Anmeldung läuft…' : 'Mit Microsoft anmelden'}
        </button>
      ) : (
        <div className="account">
          Angemeldet als <strong>{profile.name}</strong>
        </div>
      )}

      <button onClick={handlePlay} disabled={!profile || launching}>
        {launching ? 'Läuft…' : 'Play'}
      </button>

      {error && <p className="error">{error}</p>}

      <pre className="log">{logs.join('\n')}</pre>
    </div>
  )
}

export default App
