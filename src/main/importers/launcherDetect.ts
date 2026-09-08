import { ipcMain } from 'electron'
import { existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface LauncherOption {
  id: string
  label: string
  detected: boolean
  // Only Prism and the official launcher have a verified, parseable format
  // this app actually knows how to read - the rest get an honest "not
  // wired up yet" instead of a guessed-at, likely-wrong parser. Detection
  // itself (does the folder exist) is still shown, since knowing "yes,
  // that's installed here" is useful on its own and low-risk to guess at
  // (a wrong path just shows as not detected, nothing breaks).
  supported: boolean
}

function existsAny(paths: Array<string | null | undefined>): boolean {
  return paths.some((p) => !!p && existsSync(p))
}

// Only the well-documented, verified locations are used to *detect*
// presence - unverified guesses for the more obscure launchers are
// deliberately left out rather than risking a false "not installed" (wrong
// guessed path) or false "installed" (path collision) reading.
export function detectLaunchers(): LauncherOption[] {
  const appData = process.platform === 'win32' ? process.env.APPDATA : undefined
  const home = homedir()

  const prismDetected = existsAny([
    appData ? join(appData, 'PrismLauncher', 'instances') : null,
    join(home, '.local/share/PrismLauncher/instances'),
    join(home, '.var/app/org.prismlauncher.PrismLauncher/data/PrismLauncher/instances'),
    join(home, 'Library/Application Support/PrismLauncher/instances')
  ])

  const officialDetected = existsAny([
    appData ? join(appData, '.minecraft') : null,
    join(home, '.minecraft'),
    join(home, 'Library/Application Support/minecraft')
  ])

  const lunarDetected = existsAny([appData ? join(appData, '.lunarclient') : null, join(home, '.lunarclient')])
  const badlionDetected = existsAny([
    appData ? join(appData, '.badlion') : null,
    join(home, '.badlionclient')
  ])

  return [
    { id: 'prism', label: 'Prism Launcher', detected: prismDetected, supported: true },
    { id: 'official', label: 'Minecraft Launcher', detected: officialDetected, supported: true },
    { id: 'lunar', label: 'Lunar Client', detected: lunarDetected, supported: false },
    { id: 'badlion', label: 'Badlion Client', detected: badlionDetected, supported: false },
    { id: 'feather', label: 'Feather', detected: false, supported: false },
    { id: 'norisk', label: 'NoRisk Client', detected: false, supported: false },
    { id: 'dawn', label: 'Dawn', detected: false, supported: false }
  ]
}

export function registerLauncherDetectHandlers(): void {
  ipcMain.handle('launchers:detect', () => detectLaunchers())
}
