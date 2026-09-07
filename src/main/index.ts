import { app, shell, BrowserWindow } from 'electron'
import { join } from 'path'
import { registerAuthHandlers } from './auth/msmcAuth'
import { registerLaunchHandlers } from './launch/launcher'
import { registerInstanceHandlers } from './instances/instanceManager'
import { registerVersionHandlers } from './versions/versionManifest'
import { registerLoaderHandlers } from './loaders'
import { registerJavaHandlers } from './java/javaManager'
import { registerModHandlers } from './mods/modrinth'

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

  const mainWindow = createWindow()
  registerAuthHandlers()
  registerLaunchHandlers(mainWindow)
  registerInstanceHandlers()
  registerVersionHandlers()
  registerLoaderHandlers()
  registerJavaHandlers()
  registerModHandlers()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
