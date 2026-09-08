import { useEffect } from 'react'
import { useLoaderVersions, useMinecraftVersions } from './useVersionPicker'
import type { LoaderType, MinecraftVersionSummary } from './types'

interface Props {
  mcVersion: string
  onMcVersionChange: (value: string) => void
  loader: LoaderType
  onLoaderChange: (value: LoaderType) => void
  loaderVersion: string
  onLoaderVersionChange: (value: string) => void
  onError?: (message: string) => void
  // When set, the Minecraft-version picker is replaced by a fixed display -
  // used when creating an instance from within a version-filtered sidebar
  // view, where picking a different version would contradict why the
  // dialog was opened from there in the first place.
  lockedVersion?: string
}

// Mojang's manifest type field - "snapshot" also covers April Fools joke
// versions (e.g. 3D Shareware, 22w13oneblock), there's no separate type
// for those.
const VERSION_TYPE_ORDER = ['release', 'snapshot', 'old_beta', 'old_alpha']
const VERSION_TYPE_LABELS: Record<string, string> = {
  release: 'Release',
  snapshot: 'Snapshot (inkl. Scherzversionen)',
  old_beta: 'Beta',
  old_alpha: 'Alpha'
}

function groupVersions(
  versions: MinecraftVersionSummary[]
): Array<{ label: string; items: MinecraftVersionSummary[] }> {
  const groups = VERSION_TYPE_ORDER.map((type) => ({
    label: VERSION_TYPE_LABELS[type],
    items: versions.filter((v) => v.type === type)
  })).filter((g) => g.items.length > 0)

  const known = new Set(VERSION_TYPE_ORDER)
  const other = versions.filter((v) => !known.has(v.type))
  if (other.length > 0) groups.push({ label: 'Andere', items: other })

  return groups
}

// Shared by CreateInstanceDialog and CloneAsVersionDialog: a Minecraft
// version picker (every version Mojang publishes - release, snapshot,
// beta, alpha), a loader picker, and a loader-version picker that
// automatically re-queries whenever the first two change.
function VersionLoaderFields(props: Props): React.JSX.Element {
  const {
    mcVersion,
    onMcVersionChange,
    loader,
    onLoaderChange,
    loaderVersion,
    onLoaderVersionChange,
    onError,
    lockedVersion
  } = props

  const { versions, loading: loadingVersions, error: versionsError } = useMinecraftVersions()
  const {
    loaderVersions,
    loading: loadingLoaderVersions,
    error: loaderVersionsError
  } = useLoaderVersions(loader, mcVersion)

  useEffect(() => {
    if (lockedVersion) return
    if (!loadingVersions && versions.length > 0 && !mcVersion) {
      // Default to the latest stable release even though every version is
      // selectable - most people creating an instance want that, not
      // whatever snapshot happens to sort first.
      const defaultVersion = versions.find((v) => v.type === 'release') ?? versions[0]
      onMcVersionChange(defaultVersion.id)
    }
  }, [loadingVersions, versions, lockedVersion])

  // Whenever the loader or target MC version changes, the previously
  // selected loader version is very likely no longer valid - clear it so
  // the auto-select-first effect below can pick a fresh one.
  useEffect(() => {
    onLoaderVersionChange('')
  }, [loader, mcVersion])

  useEffect(() => {
    if (!loadingLoaderVersions && loaderVersions.length > 0 && !loaderVersion) {
      onLoaderVersionChange(loaderVersions[0].version)
    }
  }, [loadingLoaderVersions, loaderVersions])

  useEffect(() => {
    if (versionsError) onError?.(versionsError)
  }, [versionsError, onError])

  useEffect(() => {
    if (loaderVersionsError) onError?.(loaderVersionsError)
  }, [loaderVersionsError, onError])

  const groupedVersions = groupVersions(versions)

  return (
    <>
      <label>
        Minecraft-Version
        {lockedVersion ? (
          <p className="locked-version-display">{lockedVersion}</p>
        ) : loadingVersions ? (
          <p>Lade Versionen…</p>
        ) : (
          <select value={mcVersion} onChange={(e) => onMcVersionChange(e.target.value)}>
            {groupedVersions.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.id}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        )}
      </label>

      <label>
        Mod Loader
        <select value={loader} onChange={(e) => onLoaderChange(e.target.value as LoaderType)}>
          <option value="vanilla">Vanilla</option>
          <option value="fabric">Fabric</option>
          <option value="quilt">Quilt</option>
          <option value="legacyfabric">Legacy Fabric</option>
          <option value="forge">Forge</option>
          <option value="neoforge">NeoForge</option>
        </select>
      </label>

      {loader !== 'vanilla' && (
        <label>
          Loader-Version
          {loadingLoaderVersions ? (
            <p>Lade Loader-Versionen…</p>
          ) : loaderVersions.length === 0 ? (
            <p>Keine Loader-Version für diese Minecraft-Version gefunden.</p>
          ) : (
            <select value={loaderVersion} onChange={(e) => onLoaderVersionChange(e.target.value)}>
              {loaderVersions.map((v) => (
                <option key={v.version} value={v.version}>
                  {v.version}
                  {v.stable ? '' : ' (unstable)'}
                </option>
              ))}
            </select>
          )}
        </label>
      )}
    </>
  )
}

export default VersionLoaderFields
