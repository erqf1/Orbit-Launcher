import { ipcMain, BrowserWindow } from 'electron'
import { Auth } from 'msmc'
import { saveAuthToken, loadAuthToken, clearAuthToken } from './authStore'

export interface LauncherProfile {
  name: string
  id: string
}

// The JSON shape MCLC's `authorization` launch option expects (see MCLC docs);
// msmc's `Minecraft.mclc()` produces an object matching this shape.
export interface MclcAuthorization {
  access_token: string
  client_token: string
  uuid: string
  name: string
  user_properties: string
  meta?: {
    type: 'mojang' | 'msa'
    demo?: boolean
    xuid?: string
    clientId?: string
  }
}

// msmc throws Error objects whose .message is one of these lexicon codes
// (see node_modules/msmc/types/util/lexicon.d.ts) rather than a human
// sentence - translate the ones a user could actually hit.
const FRIENDLY_AUTH_ERRORS: Record<string, string> = {
  'error.gui.closed':
    'Das Anmeldefenster wurde geschlossen, bevor die Anmeldung abgeschlossen war. Bitte erneut versuchen.',
  'error.gui.raw.noBrowser': 'Kein Standardbrowser gefunden, um die Anmeldung durchzuführen.',
  'error.auth.xsts.userNotFound':
    'Dieses Microsoft-Konto hat noch kein Xbox-Profil. Einmal auf xbox.com anmelden und erneut versuchen.',
  'error.auth.xsts.bannedCountry': 'Xbox Live ist in diesem Land nicht verfügbar.',
  'error.auth.xsts.child':
    'Für dieses Konto ist die Zustimmung eines Erziehungsberechtigten (Microsoft Family) nötig.',
  'error.auth.minecraft.entitlements': 'Dieses Konto besitzt kein Minecraft: Java Edition.',
  'error.state.invalid': 'Die Anmeldung ist ungültig geworden. Bitte erneut versuchen.'
}

function friendlyAuthError(err: unknown): Error {
  const message = err instanceof Error ? err.message : String(err)
  return new Error(FRIENDLY_AUTH_ERRORS[message] ?? message)
}

// Holds the most recently signed-in account for the lifetime of the app.
// The underlying Xbox session is additionally persisted to disk (see
// authStore.ts) so it survives a restart without a fresh interactive login.
let currentAuthorization: MclcAuthorization | null = null
let currentProfile: LauncherProfile | null = null

export function getMclcAuthorization(): MclcAuthorization | null {
  return currentAuthorization
}

async function applyMinecraftSession(
  minecraft: Awaited<ReturnType<Awaited<ReturnType<Auth['launch']>>['getMinecraft']>>
): Promise<LauncherProfile> {
  if (!minecraft.profile) {
    throw new Error('Dieses Microsoft-Konto besitzt kein Minecraft: Java Edition.')
  }
  currentAuthorization = minecraft.mclc() as unknown as MclcAuthorization
  currentProfile = { name: minecraft.profile.name, id: minecraft.profile.id }
  return currentProfile
}

export function registerAuthHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('auth:login', async () => {
    try {
      const authManager = new Auth('select_account')
      // parent + modal so the popup is clearly anchored to the main window
      // instead of a possibly-easy-to-miss separate top-level window.
      const xboxManager = await authManager.launch('electron', {
        width: 520,
        height: 700,
        parent: mainWindow,
        modal: true
      })
      const minecraft = await xboxManager.getMinecraft()
      const profile = await applyMinecraftSession(minecraft)
      saveAuthToken(xboxManager.save())

      return { profile }
    } catch (err) {
      throw friendlyAuthError(err)
    }
  })

  // Tries to silently restore a saved session before falling back to "not
  // signed in" - called once on app start by the renderer. A failed/expired
  // saved token is treated as a normal "please sign in again", not an error.
  ipcMain.handle('auth:current', async () => {
    if (currentProfile) return { profile: currentProfile }

    const savedToken = loadAuthToken()
    if (!savedToken) return { profile: null }

    try {
      const authManager = new Auth('select_account')
      const xboxManager = await authManager.refresh(savedToken)
      const minecraft = await xboxManager.getMinecraft()
      const profile = await applyMinecraftSession(minecraft)
      saveAuthToken(xboxManager.save())
      return { profile }
    } catch {
      clearAuthToken()
      return { profile: null }
    }
  })
}
