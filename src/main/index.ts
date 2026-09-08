import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import gracefulFs from 'graceful-fs'
import { patchCreateWriteStreamForEmfile } from './emfileSafeFs'
import { registerAuthHandlers } from './auth/msmcAuth'
import { registerLaunchHandlers, setPendingLaunchInstanceIdFromArgv } from './launch/launcher'
import { registerInstanceHandlers } from './instances/instanceManager'
import { registerVersionHandlers } from './versions/versionManifest'
import { registerLoaderHandlers } from './loaders'
import { registerJavaHandlers } from './java/javaManager'
import { registerModHandlers } from './mods/modrinth'
import { registerCuratedModHandlers } from './mods/curated'
import { registerPrismImportHandlers } from './importers/prismImport'
import { registerContentFolderHandlers } from './instances/contentFolders'
import { registerWorldHandlers } from './instances/worlds'
import { registerServerHandlers } from './instances/servers'
import { registerLogHandlers } from './instances/logs'

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

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
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

  const mainWindow = createWindow()
  registerAuthHandlers(mainWindow)
  registerLaunchHandlers(mainWindow)
  registerInstanceHandlers()
  registerVersionHandlers()
  registerLoaderHandlers()
  registerJavaHandlers()
  registerModHandlers()
  registerCuratedModHandlers()
  registerPrismImportHandlers()
  registerContentFolderHandlers()
  registerWorldHandlers()
  registerServerHandlers()
  registerLogHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
