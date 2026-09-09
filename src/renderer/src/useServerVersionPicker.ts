import { useEffect, useState } from 'react'
import type { PaperBuildSummary } from './types'

export function usePaperVersions(): { versions: string[]; loading: boolean; error: string | null } {
  const [versions, setVersions] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.api
      .listPaperVersions()
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

export function usePaperBuilds(mcVersion: string): {
  builds: PaperBuildSummary[]
  loading: boolean
  error: string | null
} {
  const [builds, setBuilds] = useState<PaperBuildSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!mcVersion) {
      setBuilds([])
      return
    }
    let cancelled = false
    setLoading(true)
    window.api
      .listPaperBuilds(mcVersion)
      .then((list) => {
        if (!cancelled) setBuilds(list)
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
  }, [mcVersion])

  return { builds, loading, error }
}
