import { useEffect } from 'react'
import { useLoaderVersions, useMinecraftVersions } from './useVersionPicker'
import type { LoaderType } from './types'

interface Props {
  mcVersion: string
  onMcVersionChange: (value: string) => void
  loader: LoaderType
  onLoaderChange: (value: LoaderType) => void
  loaderVersion: string
  onLoaderVersionChange: (value: string) => void
  onError?: (message: string) => void
}

// Shared by CreateInstanceDialog and CloneAsVersionDialog: a Minecraft
// version picker, a loader picker, and a loader-version picker that
// automatically re-queries whenever the first two change.
function VersionLoaderFields(props: Props): React.JSX.Element {
  const {
    mcVersion,
    onMcVersionChange,
    loader,
    onLoaderChange,
    loaderVersion,
    onLoaderVersionChange,
    onError
  } = props

  const { versions, loading: loadingVersions, error: versionsError } = useMinecraftVersions()
  const {
    loaderVersions,
    loading: loadingLoaderVersions,
    error: loaderVersionsError
  } = useLoaderVersions(loader, mcVersion)

  useEffect(() => {
    if (!loadingVersions && versions.length > 0 && !mcVersion) {
      onMcVersionChange(versions[0].id)
    }
  }, [loadingVersions, versions])

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

  return (
    <>
      <label>
        Minecraft-Version
        {loadingVersions ? (
          <p>Lade Versionen…</p>
        ) : (
          <select value={mcVersion} onChange={(e) => onMcVersionChange(e.target.value)}>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.id}
              </option>
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
