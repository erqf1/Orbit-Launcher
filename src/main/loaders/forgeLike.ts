import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { LoaderVersionSummary } from './fabricLike'

export type { LoaderVersionSummary }

// Forge and NeoForge both publish a flat Maven metadata.xml listing every
// released version for the whole project (not scoped to a Minecraft
// version the way Fabric/Quilt's meta API is) - a plain regex is enough to
// pull the <version> entries out without adding an XML parser dependency
// for a format this simple, from a trusted first-party maven server.
export async function fetchMavenVersions(metadataUrl: string): Promise<string[]> {
  const res = await fetch(metadataUrl)
  if (!res.ok) {
    throw new Error(`Versionsliste konnte nicht geladen werden (HTTP ${res.status}).`)
  }
  const xml = await res.text()
  return [...xml.matchAll(/<version>([^<]+)<\/version>/g)].map((m) => m[1])
}

// Downloads a loader installer jar to <instanceRoot>/loader-installer/ so it
// exists on disk before launch - MCLC's `forge` launch option (which, despite
// the name, is also how ForgeWrapper drives NeoForge launches, since NeoForge
// deliberately kept the same installer/ForgeWrapper-compatible format as
// Forge) wants a local file path, not a URL, and reads it directly out of
// the jar at launch time rather than needing a separate "run the installer"
// step first.
export async function downloadInstaller(
  instanceRoot: string,
  installerUrl: string,
  filename: string
): Promise<string> {
  const res = await fetch(installerUrl)
  if (!res.ok) {
    throw new Error(`Installer konnte nicht geladen werden (HTTP ${res.status}).`)
  }
  const dir = join(instanceRoot, 'loader-installer')
  mkdirSync(dir, { recursive: true })
  const dest = join(dir, filename)
  writeFileSync(dest, Buffer.from(await res.arrayBuffer()))
  return dest
}
