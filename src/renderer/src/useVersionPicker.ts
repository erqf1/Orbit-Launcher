import { useEffect, useState } from 'react'
import type { LoaderType, LoaderVersionSummary, MinecraftVersionSummary } from './types'

export function useMinecraftVersions(): {
  versions: MinecraftVersionSummary[]
  loading: boolean
  error: string | null
} {
  const [versions, setVersions] = useState<MinecraftVersionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .listVersions()
      .then((list) => {
        if (!cancelled) setVersions(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return { versions, loading, error }
}

export function useLoaderVersions(
  loader: LoaderType,
  mcVersion: string
): { loaderVersions: LoaderVersionSummary[]; loading: boolean; error: string | null } {
  const [loaderVersions, setLoaderVersions] = useState<LoaderVersionSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (loader === 'vanilla' || !mcVersion) {
      setLoaderVersions([])
      return
    }
    let cancelled = false
    setLoading(true)
    window.api
      .listLoaderVersions(loader, mcVersion)
      .then((list) => {
        if (!cancelled) setLoaderVersions(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [loader, mcVersion])

  return { loaderVersions, loading, error }
}
