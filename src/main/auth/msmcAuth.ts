import { ipcMain, BrowserWindow } from 'electron'
import { Auth } from 'msmc'
import {
  saveAccountToken,
  loadAccountToken,
  listSavedAccounts,
  getActiveAccountId,
  setActiveAccountId,
  removeAccount,
  getAskOnPlay,
  setAskOnPlay,
  type SavedAccountMeta
} from './authStore'

export interface LauncherProfile {
  name: string
  id: string
}

export interface AuthResult {
  profile: LauncherProfile | null
  accounts: SavedAccountMeta[]
  askOnPlay: boolean
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

// Cached per-account MCLC authorization for this run of the app, keyed by
// Minecraft profile id (the same id persisted in authStore's account
// index) - so switching back to an already-used account within the same
// session doesn't need a fresh network refresh.
const authorizationCache = new Map<string, MclcAuthorization>()

export function getMclcAuthorization(): MclcAuthorization | null {
  const activeId = getActiveAccountId()
  if (!activeId) return null
  return authorizationCache.get(activeId) ?? null
}

async function applyMinecraftSession(
  minecraft: Awaited<ReturnType<Awaited<ReturnType<Auth['launch']>>['getMinecraft']>>
): Promise<LauncherProfile> {
  if (!minecraft.profile) {
    throw new Error('Dieses Microsoft-Konto besitzt kein Minecraft: Java Edition.')
  }
  const profile: LauncherProfile = { name: minecraft.profile.name, id: minecraft.profile.id }
  authorizationCache.set(profile.id, minecraft.mclc() as unknown as MclcAuthorization)
  return profile
}

// Guards against two concurrent restores for the same account racing each
// other - React StrictMode double-invokes effects in dev mode, which fires
// auth:current twice back-to-back on every startup, and each would
// otherwise call Auth.refresh() with the *same* refresh token in parallel.
// Microsoft rotates refresh tokens on use, so two simultaneous refreshes of
// the same token is a real thundering-herd bug, not just wasted work - one
// of the two calls can come back rejected, and if that's the one whose IPC
// response reaches the renderer last, it silently overwrites an otherwise
// successful login with null (Play stays disabled until the user manually
// re-picks the account). Fix: concurrent callers for the same id share one
// in-flight promise instead of each starting their own network round trip.
const inFlightAuth = new Map<string, Promise<LauncherProfile | null>>()

// Makes sure `id` has a live, cached MCLC authorization, refreshing its
// saved token if this session hasn't loaded it yet. A saved account whose
// token has expired beyond refresh is removed from the store rather than
// left around to fail the same way every time - the caller decides whether
// that's worth surfacing as an error (a silent startup restore shouldn't
// bother the user, an explicit switch should).
function ensureAuthorizationFor(id: string): Promise<LauncherProfile | null> {
  if (authorizationCache.has(id)) {
    const meta = listSavedAccounts().find((a) => a.id === id)
    return Promise.resolve(meta ? { id: meta.id, name: meta.name } : null)
  }

  const existing = inFlightAuth.get(id)
  if (existing) return existing

  const attempt = (async (): Promise<LauncherProfile | null> => {
    const savedToken = loadAccountToken(id)
    if (!savedToken) return null

    try {
      const authManager = new Auth('select_account')
      const xboxManager = await authManager.refresh(savedToken)
      const minecraft = await xboxManager.getMinecraft()
      const profile = await applyMinecraftSession(minecraft)
      saveAccountToken(profile.id, profile.name, xboxManager.save())
      return profile
    } catch {
      removeAccount(id)
      return null
    } finally {
      inFlightAuth.delete(id)
    }
  })()

  inFlightAuth.set(id, attempt)
  return attempt
}

export function registerAuthHandlers(mainWindow: BrowserWindow): void {
  ipcMain.handle('auth:login', async (): Promise<AuthResult> => {
    try {
      const authManager = new Auth('select_account')
      // parent + modal so the popup is clearly anchored to the main window
      // instead of a possibly-easy-to-miss separate top-level window.
      // 'select_account' also means adding a second/third account here
      // always offers Microsoft's own account picker rather than silently
      // reusing whatever session the login webview already has cached.
      const xboxManager = await authManager.launch('electron', {
        width: 520,
        height: 700,
        parent: mainWindow,
        modal: true
      })
      const minecraft = await xboxManager.getMinecraft()
      const profile = await applyMinecraftSession(minecraft)
      saveAccountToken(profile.id, profile.name, xboxManager.save())
      setActiveAccountId(profile.id)

      return { profile, accounts: listSavedAccounts(), askOnPlay: getAskOnPlay() }
    } catch (err) {
      throw friendlyAuthError(err)
    }
  })

  // Tries to silently restore the active saved account before falling back
  // to "not signed in" - called once on app start by the renderer. A
  // failed/expired saved token only drops that one account, the rest of
  // the switcher list is unaffected.
  ipcMain.handle('auth:current', async (): Promise<AuthResult> => {
    const activeId = getActiveAccountId()
    if (!activeId) return { profile: null, accounts: listSavedAccounts(), askOnPlay: getAskOnPlay() }
    const profile = await ensureAuthorizationFor(activeId)
    return { profile, accounts: listSavedAccounts(), askOnPlay: getAskOnPlay() }
  })

  ipcMain.handle('auth:switch', async (_event, id: string): Promise<AuthResult> => {
    const existedBefore = listSavedAccounts().some((a) => a.id === id)
    const profile = await ensureAuthorizationFor(id)
    if (profile) {
      setActiveAccountId(id)
    } else if (existedBefore) {
      throw new Error('Diese Sitzung ist abgelaufen. Bitte das Konto erneut hinzufügen.')
    }
    return { profile, accounts: listSavedAccounts(), askOnPlay: getAskOnPlay() }
  })

  ipcMain.handle('auth:remove', async (_event, id: string): Promise<AuthResult> => {
    authorizationCache.delete(id)
    removeAccount(id)

    const activeId = getActiveAccountId()
    if (!activeId) return { profile: null, accounts: listSavedAccounts(), askOnPlay: getAskOnPlay() }
    const profile = await ensureAuthorizationFor(activeId)
    return { profile, accounts: listSavedAccounts(), askOnPlay: getAskOnPlay() }
  })

  ipcMain.handle('auth:setAskOnPlay', (_event, value: boolean): AuthResult => {
    setAskOnPlay(value)
    const activeId = getActiveAccountId()
    const profile = activeId ? (listSavedAccounts().find((a) => a.id === activeId) ?? null) : null
    return { profile, accounts: listSavedAccounts(), askOnPlay: value }
  })
}
