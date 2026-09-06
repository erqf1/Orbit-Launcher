import { ipcMain } from 'electron'
import { Auth } from 'msmc'

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

// Holds the most recently signed-in account for the lifetime of the app.
// Phase 1 keeps this in memory only (no disk persistence / multi-account yet).
let currentAuthorization: MclcAuthorization | null = null
let currentProfile: LauncherProfile | null = null

export function getMclcAuthorization(): MclcAuthorization | null {
  return currentAuthorization
}

export function registerAuthHandlers(): void {
  ipcMain.handle('auth:login', async () => {
    const authManager = new Auth('select_account')
    const xboxManager = await authManager.launch('electron', { width: 500, height: 650 })
    const minecraft = await xboxManager.getMinecraft()
    if (!minecraft.profile) {
      throw new Error('Dieses Microsoft-Konto besitzt kein Minecraft: Java Edition.')
    }

    currentAuthorization = minecraft.mclc() as unknown as MclcAuthorization
    currentProfile = { name: minecraft.profile.name, id: minecraft.profile.id }

    return { profile: currentProfile }
  })

  ipcMain.handle('auth:current', async () => {
    return { profile: currentProfile }
  })
}
