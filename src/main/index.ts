import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import gracefulFs from 'graceful-fs'
import { patchCreateWriteStreamForEmfile } from './emfileSafeFs'
import { registerAuthHandlers } from './auth/msmcAuth'
import { registerSkinHistoryHandlers } from './auth/skinHistory'
import { registerLaunchHandlers, setPendingLaunchInstanceIdFromArgv, setIsAnyServerRunningCheck } from './launch/launcher'
import { registerInstanceHandlers } from './instances/instanceManager'
import { registerVersionHandlers } from './versions/versionManifest'
import { registerLoaderHandlers } from './loaders'
import { registerJavaHandlers } from './java/javaManager'
import { registerModHandlers } from './mods/modrinth'
import { registerCuratedModHandlers } from './mods/curated'
import { registerPrismImportHandlers } from './importers/prismImport'
import { registerOfficialImportHandlers } from './importers/officialImport'
import { registerLauncherDetectHandlers } from './importers/launcherDetect'
import { registerContentFolderHandlers } from './instances/contentFolders'
import { registerWorldHandlers } from './instances/worlds'
import { registerServerHandlers } from './instances/servers'
import { registerLogHandlers } from './instances/logs'
import { registerAppSettingsHandlers } from './appSettings'
import { registerServerManagerHandlers, setIsServerRunningCheck } from './servers/serverManager'
import { registerServerProcessHandlers, isServerRunning, isAnyServerRunning } from './servers/serverProcess'
import { registerServerPropertiesHandlers } from './servers/serverProperties'
import { registerTunnelHandlers } from './servers/playitTunnel'
import { registerFriendsModsHandlers } from './servers/friendsMods'
import { registerServerFileHandlers } from './servers/serverFiles'
import { registerPaperConfigHandlers } from './servers/paperConfig'
import { registerFolderImportHandlers } from './importers/folderImport'
import { registerZipImportHandlers } from './importers/zipImport'

// `require`, not `import * as fs from 'fs'`: the latter produced a
// read-only ESM namespace object under esbuild's interop, which is what
// broke earlier attempts at the patches below ("Cannot set property ...
// which has only a getter") - not anything Electron itself seals.
// `require` gives the real, mutable CJS module object.
const fs = require('fs') as typeof import('fs')

// MCLC's asset downloader fires one unbounded Promise.all over every asset
// in a version's index (thousands of entries for modern MC) with zero
// concurrency limiting - fs.readFile/writeFile/etc. get EMFILE-retry
// protection from graceful-fs, and fs.createWriteStream (what the actual
// downloader uses) gets a proactive concurrency cap from emfileSafeFs -
// see that file for why a retry-after-failure approach there hung instead
// of fixing anything. Both wrapped in try/catch defensively: an earlier
// version of this file left a patch call unguarded and that crashed the
// app on every single startup, not just during downloads.
try {
  gracefulFs.gracefulify(fs)
} catch (err) {
  console.error('[graceful-fs] gracefulify failed:', err)
}
try {
  patchCreateWriteStreamForEmfile()
} catch (err) {
  console.error('[emfileSafeFs] failed to patch createWriteStream:', err)
}

// app.getPath('userData') defaults to a folder named after package.json's
// "name" field - renaming the app (e.g. Erqf Launcher -> Orbit Launcher)
// silently pointed every future launch at a brand-new, empty folder while
// all real instance data stayed behind under the old name, which looked
// exactly like every instance had been deleted. Pinning this explicitly
// means a future rename only changes branding, never where user data lives.
app.setPath('userData', join(app.getPath('appData'), 'orbit-launcher'))

// authStore.ts persists Microsoft account tokens via Electron's safeStorage,
// which on Linux normally shells out to whatever freedesktop Secret Service
// backend is running (gnome-keyring, kwallet). Plenty of real Linux setups -
// minimal window managers like i3/sway/dwm (common on Arch, e.g. the pacman
// build), a DE-less install, or just a session where the dbus session bus
// isn't wired up the way GNOME/KDE's own session manager does it - have none
// of those running, so safeStorage.isEncryptionAvailable() is simply false.
// That used to make login look like it silently did nothing: the OAuth popup
// would succeed, but authStore's saveAccountToken no-op'd instead of
// persisting the account (see authStore.ts), so the app just fell back to
// showing the login button again with no error. Forcing Electron's built-in
// "basic" store (an obfuscated on-disk store that doesn't depend on any
// keyring daemon) sidesteps that entirely - must be set before app is ready.
// One-time cost: a Linux user whose token was already encrypted via a real
// keyring backend before this change will need to log in again once, since
// that ciphertext won't decrypt under the basic store's own key.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('password-store', 'basic')
}

// Only one running instance of the launcher makes sense - a second launch
// (e.g. double-clicking the exe again while it's already open) should focus
// the existing window instead of opening an independent second one. Must be
// requested before app.whenReady()/createWindow() run in this process; if
// the lock isn't acquired, another instance already holds it. app.quit()
// alone doesn't stop the rest of this module from running - it only
// schedules an async quit - so without process.exit this losing process
// would still briefly create its own window and register every IPC handler
// before actually quitting. Safe to exit immediately here since nothing
// (no window, no child process) has been created in this process yet.
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
  app.quit()
  process.exit(0)
}

let mainWindow: BrowserWindow | null = null

// A packaged build already gets this for free - electron-builder.yml's
// win.icon embeds build/icon.ico directly into the compiled exe, and
// Electron falls back to an exe's own icon when no explicit `icon` option
// is given. In dev mode there's no custom-compiled exe at all (it runs
// through node_modules/electron/dist/electron.exe, which carries Electron's
// own default icon) - this is what actually put Electron's icon in the
// title bar/taskbar during development, so it's set explicitly here.
// build/ isn't part of the packaged app's files (see electron-builder.yml),
// so this path only resolves in dev - existsSync guards against passing a
// bad path to BrowserWindow in the packaged build rather than relying on
// Electron to silently ignore it.
const iconPath = join(__dirname, '../../build/icon.png')

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(fs.existsSync(iconPath) ? { icon: iconPath } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
    // show() is documented to also grant keyboard focus, but that's not
    // reliable everywhere - the OAuth popup in msmcAuth.ts hit the same
    // family of bug (modal:true rendering a window that GNOME/Wayland never
    // actually focuses) and needed an explicit fix there. A freshly-mapped
    // top-level window can hit an even more basic version of it: some Linux
    // window managers apply focus-stealing prevention to windows shown
    // outside a direct user gesture (this one is 'show:false' + shown
    // later, from ready-to-show), leaving it visible but without real
    // input focus - clicks still land since hit-testing doesn't need
    // focus, but every keystroke into every text field goes nowhere until
    // the user manually alt-tabs away and back. Calling focus() explicitly
    // mirrors what the 'second-instance' handler below already does for
    // the same reason.
    mainWindow.focus()
  })

  // A hosted server is a direct child process of this same Electron main
  // process (serverProcess.ts) - closing the last window (or app.quit()
  // being called for any reason, e.g. an instance's "quit launcher when the
  // game closes" option, which Electron implements by closing every window
  // first) would take the server down with it too, not just close the
  // window. Blocking the close here - rather than only guarding the
  // quit-on-game-close call site - covers every path that leads to a quit
  // (the X button, Alt+F4, the taskbar, all of them), not just that one.
  mainWindow.on('close', (event) => {
    if (isAnyServerRunning()) {
      event.preventDefault()
      mainWindow.show()
      mainWindow.focus()
      mainWindow.webContents.send('launch:quitSuppressed', {})
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    // Surfaces renderer console output (incl. uncaught React errors) in the
    // same terminal as the main process, since there's no attached DevTools
    // window to read it from otherwise.
    mainWindow.webContents.on('console-message', (details) => {
      console.log(`[renderer:${details.level}]`, details.message)
    })
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.whenReady().then(() => {
  app.setAppUserModelId('com.erqf.launcher')

  setPendingLaunchInstanceIdFromArgv(process.argv)

  const win = createWindow()
  mainWindow = win
  registerAuthHandlers(win)
  registerSkinHistoryHandlers()
  registerLaunchHandlers(win)
  registerInstanceHandlers()
  registerVersionHandlers()
  registerLoaderHandlers()
  registerJavaHandlers()
  registerModHandlers()
  registerCuratedModHandlers()
  registerPrismImportHandlers()
  registerOfficialImportHandlers()
  registerLauncherDetectHandlers()
  registerContentFolderHandlers()
  registerWorldHandlers()
  registerServerHandlers()
  registerLogHandlers()
  registerAppSettingsHandlers()
  registerServerManagerHandlers()
  registerServerProcessHandlers(win)
  setIsServerRunningCheck(isServerRunning)
  setIsAnyServerRunningCheck(isAnyServerRunning)
  registerServerPropertiesHandlers()
  registerTunnelHandlers(win)
  registerFriendsModsHandlers()
  registerServerFileHandlers()
  registerPaperConfigHandlers()
  registerFolderImportHandlers()
  registerZipImportHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow()
  })

  // A second launch attempt (e.g. double-clicking the exe again) fires this
  // in the already-running process instead of starting a new one, once the
  // second process finds the lock unavailable and quits itself (see
  // requestSingleInstanceLock above). Only ever show/focus/restore here -
  // never close or quit mainWindow - so this can't conflict with the
  // "never disappear while a hosted server is running" guard on its own
  // 'close' handler above.
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
