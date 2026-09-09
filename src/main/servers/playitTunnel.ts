import { ipcMain, app, BrowserWindow } from 'electron'
import { existsSync, chmodSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { getServer } from './serverManager'
import { getPlayitTunnelConfig, setPlayitTunnelAddress } from '../appSettings'

// playit.gg was chosen over Tailscale specifically because it needs zero
// setup on the *friend's* side (they just get an IP:port) - only the host
// runs this one agent binary. Must branch on platform since this app builds
// for both win/linux (electron-builder.yml) - hardcoding the Windows binary
// would silently break Linux hosting.
const PLAYIT_RELEASE = 'https://github.com/playit-cloud/playit-agent/releases/download/v1.0.10'

function platformBinaryName(): string {
  if (process.platform === 'win32') return 'playit-windows-x86_64-signed.exe'
  if (process.platform === 'linux') return 'playit-linux-amd64'
  throw new Error('playit.gg wird auf diesem Betriebssystem nicht unterstützt.')
}

function toolsDir(): string {
  return join(app.getPath('userData'), 'tools', 'playit')
}

function binaryPath(): string {
  const name = process.platform === 'win32' ? 'playit.exe' : 'playit'
  return join(toolsDir(), name)
}

// Verified live by actually running the downloaded binary: it does NOT
// accept a secret path via an environment variable at all. The real flags
// (from `playit.exe --help`) are `--secret-path <path>` and `--secret
// <key>` - but they are MUTUALLY EXCLUSIVE, confirmed live. Also confirmed
// live: `--secret-path` alone with a fresh/nonexistent file waits forever
// for playit's own GUI companion app over IPC (no headless claim-URL mode
// exists), and `--secret` alone never writes any file to disk at all - it's
// a pure per-run in-memory flag. So there is no CLI-only way to get a
// *persistent* secret file; the correct design is simpler: always launch
// with bare `--secret <key>`, no `--secret-path`, every time.
export const PLAYIT_WIZARD_URL = 'https://playit.gg/account/setup/wizard/new-account/docker/docker-name'

// Verified live: a claimed agent connects fine and shows
// account_status="verified" in its own logs, but reports tunnel_count=0
// forever and never assigns any address - `--secret`/`--secret-path` only
// ever authenticate the daemon, they don't create a tunnel. Confirmed
// directly with playit.gg's own support team (account-level API keys are
// explicitly "not available for that purpose", even on paid plans) that
// there is no way to create a tunnel except this dashboard page. This is
// also why the app now uses one shared agent+tunnel for every hosted
// server instead of one per server - the manual step only has to happen
// once, ever, in exchange for only one server being able to run (and be
// reachable through the tunnel) at a time.
export const PLAYIT_NEW_TUNNEL_URL = 'https://playit.gg/account/setup/new-tunnel'

async function ensureBinaryDownloaded(): Promise<string> {
  const dest = binaryPath()
  if (existsSync(dest)) return dest

  const url = `${PLAYIT_RELEASE}/${platformBinaryName()}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`playit.gg-Agent konnte nicht geladen werden (HTTP ${res.status}).`)
  mkdirSync(toolsDir(), { recursive: true })
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  if (process.platform !== 'win32') chmodSync(dest, 0o755)
  return dest
}

// One shared tunnel for the whole launcher (see appSettings.ts's
// playitSecretKey/playitTunnelPort/playitTunnelAddress), not tied to any
// particular server's identity - it can be started standalone from
// PlayitSettingsDialog (right after saving a secret key, so the agent shows
// up as online in playit.gg's own "assign to agent" picker without the user
// needing to start a real server first) just as well as it can auto-start
// alongside a hosted server. A plain ChildProcess slot rather than a Map
// keyed by server, since there is structurally only ever one: playit.gg
// itself only ever maps one local port, and serverProcess.ts's startServer
// already refuses to start a second hosted server while one is running.
let runningTunnel: ChildProcess | null = null
// Tracks whether the running tunnel has already had an address
// auto-assigned this run - see the ADDRESS_PATTERN comment below for why a
// match is only trusted once per run instead of every time the pattern
// re-fires.
let addressLockedThisRun = false

const CLAIM_URL_PATTERN = /https:\/\/playit\.gg\/claim\/[a-zA-Z0-9-]+/
// The exact stdout shape for "here is your assigned public address" hasn't
// been confirmed against a real run yet - matches a bare host:port anywhere
// in a log line as a best-effort heuristic, alongside always showing the
// raw log so a missed match is never silently hidden from the user. Because
// this is a free-text-log heuristic (not a structured/machine-readable
// signal), a false positive is worse than a false negative - playit's own
// reconnect/relay-handshake log lines could plausibly reference the same
// *.playit.gg host:port shape. Mitigated two ways: (1) only the FIRST match
// per tunnel run is trusted (addressLockedThisRun) - a later match (e.g.
// from a reconnect message) can't clobber an already-detected address; (2)
// an address the user already saved is never silently overwritten - the
// event still fires so the UI can show it as a suggestion, but the disk
// write is skipped.
const ADDRESS_PATTERN = /\b([a-zA-Z0-9.-]+\.(?:joinmc\.link|playit\.gg):\d+)\b/

// Buffers partial lines across 'data' events - spawn's data events don't
// respect line boundaries (see serverProcess.ts's makeLineBuffer, which
// this mirrors; a claim URL or address split across two chunks would
// otherwise silently fail to match either regex).
function makeLineBuffer(onLine: (line: string) => void): (chunk: Buffer) => void {
  let buffer = ''
  return (chunk: Buffer) => {
    buffer += chunk.toString('utf-8')
    const lines = buffer.split(/\r?\n/)
    buffer = lines.pop() ?? ''
    for (const line of lines) onLine(line)
  }
}

// localPort is optional - omitted when started standalone from
// PlayitSettingsDialog right after saving a secret key, purely to get the
// agent connected/visible in playit.gg's own dashboard before any server
// exists to run it against yet. The port-mismatch warning below only makes
// sense once a real server's port is known.
export async function startTunnel(mainWindow: BrowserWindow, localPort?: number): Promise<void> {
  if (runningTunnel) return
  const config = getPlayitTunnelConfig()
  if (!config.secretKey) {
    throw new Error(`Bitte zuerst einen playit.gg-Secret-Key eintragen (über ${PLAYIT_WIZARD_URL} generieren).`)
  }
  const bin = await ensureBinaryDownloaded()

  const child = spawn(bin, ['--secret', config.secretKey], { cwd: toolsDir() })
  runningTunnel = child
  addressLockedThisRun = false

  const send = (line: string): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('tunnel:log', { line })
  }

  if (localPort !== undefined && localPort !== config.localPort) {
    send(
      `[Warnung] Dieser Server läuft auf Port ${localPort}, der Tunnel ist aber auf Port ${config.localPort} eingerichtet - Freunde können den Server über den Tunnel nicht erreichen, solange die Ports nicht übereinstimmen.`
    )
  }

  function handleLine(line: string): void {
    if (!line) return
    send(line)
    const claim = CLAIM_URL_PATTERN.exec(line)
    if (claim && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:claimUrl', { url: claim[0] })
    }
    const address = ADDRESS_PATTERN.exec(line)
    if (address && !addressLockedThisRun) {
      addressLockedThisRun = true
      // Never silently overwrite an address the user already has saved -
      // still notify the renderer so it can offer the newly-seen address,
      // but only auto-persist when there wasn't already one.
      if (!getPlayitTunnelConfig().publicAddress) {
        setPlayitTunnelAddress(address[1])
      }
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tunnel:addressAssigned', { address: address[1] })
      }
    }
  }
  child.stdout?.on('data', makeLineBuffer(handleLine))
  child.stderr?.on('data', makeLineBuffer(handleLine))

  child.on('close', () => {
    runningTunnel = null
    addressLockedThisRun = false
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:closed', {})
    }
  })

  child.on('error', (err) => {
    send(`[Fehler] playit.gg-Agent konnte nicht gestartet werden: ${err.message}`)
    runningTunnel = null
    addressLockedThisRun = false
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:closed', {})
    }
  })
}

export function stopTunnel(): void {
  if (!runningTunnel) return
  runningTunnel.kill()
  runningTunnel = null
}

export function isTunnelRunning(): boolean {
  return runningTunnel !== null
}

// Called from serverProcess.ts when a server with tunnelEnabled starts, so
// the shared tunnel comes up automatically instead of requiring a separate
// manual step in the Tunnel tab every time.
export async function autoStartTunnelIfConfigured(
  mainWindow: BrowserWindow,
  serverId: string,
  localPort: number
): Promise<void> {
  const server = getServer(serverId)
  if (!server?.tunnelEnabled || !getPlayitTunnelConfig().secretKey) return
  try {
    await startTunnel(mainWindow, localPort)
  } catch (err) {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:log', {
        line: `[Fehler] Tunnel konnte nicht automatisch gestartet werden: ${err instanceof Error ? err.message : String(err)}`
      })
    }
  }
}

export function registerTunnelHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('tunnel:start', (_event, localPort?: number) => startTunnel(mainWindow, localPort))
  ipcMain.handle('tunnel:stop', () => stopTunnel())
  ipcMain.handle('tunnel:status', () => isTunnelRunning())
}
