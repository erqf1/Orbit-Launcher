import { BrowserWindow } from 'electron'

// Windows/Electron sometimes leaves the main window visually frontmost but
// without real OS input focus after a native dialog (file picker, folder
// picker, the native color <input>) closes - clicks land but don't register
// until the user manually refocuses (alt-tab, click the taskbar icon). Call
// this right after any such dialog resolves to force focus back.
export function refocusMainWindow(): void {
  const win = BrowserWindow.getAllWindows()[0]
  if (win && !win.isDestroyed()) win.focus()
}
