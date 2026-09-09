import { ipcMain, app, shell, BrowserWindow } from 'electron'
import { existsSync, chmodSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { spawn, ChildProcess } from 'child_process'
import { updateServerSettings, getServer } from './serverManager'

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

const runningTunnels = new Map<string, ChildProcess>()
// Tracks which running tunnels have already had an address auto-assigned
// this run - see the ADDRESS_PATTERN comment below for why a match is only
// trusted once per run instead of every time the pattern re-fires.
const addressLockedThisRun = new Set<string>()

const CLAIM_URL_PATTERN = /https:\/\/playit\.gg\/claim\/[a-zA-Z0-9-]+/
// The exact stdout shape for "here is your assigned public address" hasn't
// been confirmed against a real run yet (see the plan's explicit note on
// this) - matches a bare host:port anywhere in a log line as a best-effort
// heuristic, alongside always showing the raw log so a missed match is
// never silently hidden from the user. Because this is a free-text-log
// heuristic (not a structured/machine-readable signal), a false positive is
// worse than a false negative - playit's own reconnect/relay-handshake log
// lines could plausibly reference the same *.playit.gg host:port shape.
// Mitigated two ways: (1) only the FIRST match per tunnel run is trusted
// (addressLockedThisRun) - a later match (e.g. from a reconnect message)
// can't clobber an already-detected address; (2) an address the user
// already saved (server.tunnelPublicAddress) is never silently overwritten
// - the event still fires so the UI can show it as a suggestion, but the
// disk write is skipped.
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

export async function startTunnel(mainWindow: BrowserWindow, serverId: string, localPort: number): Promise<void> {
  if (runningTunnels.has(serverId)) return
  const bin = await ensureBinaryDownloaded()

  const child = spawn(bin, [], { cwd: toolsDir(), env: { ...process.env, PLAYIT_SECRET_PATH: join(toolsDir(), `${serverId}.secret`) } })
  runningTunnels.set(serverId, child)
  addressLockedThisRun.delete(serverId)

  const send = (line: string): void => {
    if (!mainWindow.isDestroyed()) mainWindow.webContents.send('tunnel:log', { serverId, line })
  }

  function handleLine(line: string): void {
    if (!line) return
    send(line)
    const claim = CLAIM_URL_PATTERN.exec(line)
    if (claim && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:claimUrl', { serverId, url: claim[0] })
    }
    const address = ADDRESS_PATTERN.exec(line)
    if (address && !addressLockedThisRun.has(serverId)) {
      addressLockedThisRun.add(serverId)
      const current = getServer(serverId)
      // Never silently overwrite an address the user already has saved -
      // still notify the renderer so it can offer the newly-seen address,
      // but only auto-persist when there wasn't already one.
      if (!current?.tunnelPublicAddress) {
        updateServerSettings(serverId, { tunnelEnabled: true, tunnelPublicAddress: address[1] })
      }
      if (!mainWindow.isDestroyed()) {
        mainWindow.webContents.send('tunnel:addressAssigned', { serverId, address: address[1] })
      }
    }
  }
  child.stdout?.on('data', makeLineBuffer(handleLine))
  child.stderr?.on('data', makeLineBuffer(handleLine))

  child.on('close', () => {
    runningTunnels.delete(serverId)
    addressLockedThisRun.delete(serverId)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:closed', { serverId })
    }
  })

  child.on('error', (err) => {
    send(`[Fehler] playit.gg-Agent konnte nicht gestartet werden: ${err.message}`)
    runningTunnels.delete(serverId)
    addressLockedThisRun.delete(serverId)
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('tunnel:closed', { serverId })
    }
  })

  // localPort isn't passed as a CLI arg today - playit's own tunnel-to-port
  // mapping is configured via its claimed dashboard, per the plan's open
  // question about how much of this is CLI-automatable. Kept as a parameter
  // (rather than dropped) since a confirmed CLI flag for it would only need
  // adding to the spawn args above, not a signature change everywhere else.
  void localPort
}

export function stopTunnel(serverId: string): void {
  const child = runningTunnels.get(serverId)
  if (!child) return
  child.kill()
  runningTunnels.delete(serverId)
}

export function isTunnelRunning(serverId: string): boolean {
  return runningTunnels.has(serverId)
}

export function claimTunnelUrl(url: string): void {
  shell.openExternal(url)
}

export function registerTunnelHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('tunnel:start', (_event, serverId: string, localPort: number) =>
    startTunnel(mainWindow, serverId, localPort)
  )
  ipcMain.handle('tunnel:stop', (_event, serverId: string) => stopTunnel(serverId))
  ipcMain.handle('tunnel:status', (_event, serverId: string) => isTunnelRunning(serverId))
  ipcMain.handle('tunnel:openClaimUrl', (_event, url: string) => claimTunnelUrl(url))
}
