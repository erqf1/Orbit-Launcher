import { ipcMain, BrowserWindow, dialog } from 'electron'
import { readFileSync } from 'fs'
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
import { refocusMainWindow } from '../windowFocus'
import { recordSkinHistory } from './skinHistory'

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

// For an instance's per-account override (Settings > General > "Override
// Default Account") - ensures that specific account's token is refreshed/
// cached (same path as switching to it) and returns its MCLC authorization,
// independent of whichever account is globally active.
export async function getMclcAuthorizationFor(id: string): Promise<MclcAuthorization | null> {
  await ensureAuthorizationFor(id)
  return authorizationCache.get(id) ?? null
}

export interface CapeInfo {
  id: string
  url: string
  alias: string
  active: boolean
}

export interface AccountCustomization {
  skinUrl: string | null
  variant: 'CLASSIC' | 'SLIM'
  capes: CapeInfo[]
}

interface MinecraftServicesProfile {
  skins?: Array<{ url: string; variant: string; state: string }>
  capes?: Array<{ id: string; url: string; alias: string; state: string }>
}

function requireAuth(id: string): MclcAuthorization {
  const auth = authorizationCache.get(id)
  if (!auth) throw new Error('Dieses Konto ist nicht angemeldet.')
  return auth
}

// Uses the same bearer token cached for launching the game, against Mojang's
// player-facing Services API (different from the session-server API MCLC
// itself talks to) - the account's own profile endpoint conveniently
// includes the currently-equipped skin (texture URL + model variant) and
// every cape the account owns (only Mojang's own vanilla capes; a
// third-party service like MinecraftCapes has its own separate API and
// isn't covered by this).
function parseCustomization(data: MinecraftServicesProfile): AccountCustomization {
  const activeSkin = data.skins?.find((s) => s.state === 'ACTIVE')
  return {
    skinUrl: activeSkin?.url ?? null,
    variant: activeSkin?.variant === 'SLIM' ? 'SLIM' : 'CLASSIC',
    capes: (data.capes ?? []).map((c) => ({ id: c.id, url: c.url, alias: c.alias, active: c.state === 'ACTIVE' }))
  }
}

export async function getAccountCustomization(id: string): Promise<AccountCustomization | null> {
  const auth = authorizationCache.get(id)
  if (!auth) return null
  const res = await fetch('https://api.minecraftservices.com/minecraft/profile', {
    headers: { Authorization: `Bearer ${auth.access_token}` }
  })
  if (!res.ok) return null
  return parseCustomization((await res.json()) as MinecraftServicesProfile)
}

async function recordCustomizationAsHistory(id: string): Promise<AccountCustomization | null> {
  const result = await getAccountCustomization(id)
  if (result?.skinUrl) recordSkinHistory(id, result.skinUrl, result.variant)
  return result
}

// Mojang's own skin/cape mutation endpoints (skins POST, capes/active
// PUT+DELETE) all return the FULL updated profile in their response body -
// same shape as the plain GET .../minecraft/profile above. Parsing that
// directly instead of firing a *separate* GET request right after the
// mutation avoids a real read-after-write race that was causing the skin
// preview to sometimes go blank: Mojang's read path can lag slightly behind
// a just-applied write, so an immediate follow-up GET could momentarily see
// the OLD (or no) active skin. Falls back to a fresh GET only if the
// mutation response ever doesn't parse as expected, rather than silently
// returning nothing.
async function applyCustomizationFromResponse(id: string, res: Response): Promise<AccountCustomization | null> {
  try {
    const result = parseCustomization((await res.json()) as MinecraftServicesProfile)
    if (result.skinUrl) recordSkinHistory(id, result.skinUrl, result.variant)
    return result
  } catch {
    return recordCustomizationAsHistory(id)
  }
}

export async function changeSkin(id: string, variant: 'CLASSIC' | 'SLIM'): Promise<AccountCustomization | null> {
  const auth = requireAuth(id)

  const result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Skin', extensions: ['png'] }]
  })
  refocusMainWindow()
  if (result.canceled || result.filePaths.length === 0) return getAccountCustomization(id)

  const form = new FormData()
  form.append('variant', variant.toLowerCase())
  form.append('file', new Blob([readFileSync(result.filePaths[0])], { type: 'image/png' }), 'skin.png')

  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.access_token}` },
    body: form
  })
  if (!res.ok) throw new Error(`Skin-Upload fehlgeschlagen (HTTP ${res.status}).`)
  return applyCustomizationFromResponse(id, res)
}

// Same endpoint as the file-upload path above, but Mojang's skins endpoint
// also accepts a plain JSON {url, variant} body instead of a multipart file
// (confirmed against Mojang's own API docs - this is how re-equipping a
// history entry or a texture found via a username lookup works: both are
// already just a textures.minecraft.net URL, no local file to upload at all).
export async function changeSkinByUrl(
  id: string,
  skinUrl: string,
  variant: 'CLASSIC' | 'SLIM'
): Promise<AccountCustomization | null> {
  const auth = requireAuth(id)

  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/skins', {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: skinUrl, variant: variant.toLowerCase() })
  })
  if (!res.ok) throw new Error(`Skin konnte nicht gesetzt werden (HTTP ${res.status}).`)
  return applyCustomizationFromResponse(id, res)
}

export interface LookedUpSkin {
  username: string
  skinUrl: string
  variant: 'CLASSIC' | 'SLIM'
  capeUrl: string | null
}

interface SessionServerTextures {
  textures: {
    SKIN?: { url: string; metadata?: { model?: string } }
    CAPE?: { url: string }
  }
}

// Public, unauthenticated endpoints (no bearer token needed) - the same two
// calls every third-party skin-viewer site makes: username -> UUID, then
// UUID -> profile, whose base64 `textures` property blob carries the actual
// skin/cape URLs. Verified live against Notch/jeb_ - a skin with no
// `metadata.model` field is the classic model; `metadata.model === "slim"`
// is the only marker for the slim/Alex model, there's no explicit "classic"
// value ever written.
export async function lookupSkinByUsername(username: string): Promise<LookedUpSkin> {
  const profileRes = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(username)}`)
  if (profileRes.status === 404) throw new Error(`Spieler "${username}" nicht gefunden.`)
  if (!profileRes.ok) throw new Error(`Spielersuche fehlgeschlagen (HTTP ${profileRes.status}).`)
  const { id: uuid, name } = (await profileRes.json()) as { id: string; name: string }

  const sessionRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${uuid}`)
  if (!sessionRes.ok) throw new Error(`Profil konnte nicht geladen werden (HTTP ${sessionRes.status}).`)
  const session = (await sessionRes.json()) as { properties: Array<{ name: string; value: string }> }
  const texturesProp = session.properties.find((p) => p.name === 'textures')
  if (!texturesProp) throw new Error(`Für "${name}" ist kein Skin gesetzt.`)

  const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf-8')) as SessionServerTextures
  const skin = decoded.textures.SKIN
  if (!skin) throw new Error(`Für "${name}" ist kein Skin gesetzt.`)

  return {
    username: name,
    skinUrl: skin.url,
    variant: skin.metadata?.model === 'slim' ? 'SLIM' : 'CLASSIC',
    capeUrl: decoded.textures.CAPE?.url ?? null
  }
}

// capeId null unequips whatever vanilla cape is currently active - Mojang's
// API only lets one be worn at a time.
export async function setActiveCape(id: string, capeId: string | null): Promise<AccountCustomization | null> {
  const auth = requireAuth(id)

  const res = await fetch('https://api.minecraftservices.com/minecraft/profile/capes/active', {
    method: capeId ? 'PUT' : 'DELETE',
    headers: {
      Authorization: `Bearer ${auth.access_token}`,
      ...(capeId ? { 'Content-Type': 'application/json' } : {})
    },
    ...(capeId ? { body: JSON.stringify({ capeId }) } : {})
  })
  if (!res.ok) throw new Error(`Umhang konnte nicht geändert werden (HTTP ${res.status}).`)
  return applyCustomizationFromResponse(id, res)
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

  ipcMain.handle('auth:getCustomization', (_event, id: string) => getAccountCustomization(id))
  ipcMain.handle('auth:changeSkin', (_event, id: string, variant: 'CLASSIC' | 'SLIM') => changeSkin(id, variant))
  ipcMain.handle('auth:changeSkinByUrl', (_event, id: string, skinUrl: string, variant: 'CLASSIC' | 'SLIM') =>
    changeSkinByUrl(id, skinUrl, variant)
  )
  ipcMain.handle('auth:lookupSkinByUsername', (_event, username: string) => lookupSkinByUsername(username))
  ipcMain.handle('auth:setActiveCape', (_event, id: string, capeId: string | null) => setActiveCape(id, capeId))
}
