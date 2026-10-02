'use client'

import { useCallback, useEffect, useState } from 'react'

export const PORTAL_PERMISSIONS_CHANGED_EVENT = 'portal-permissions-changed'

/** Notify mounted permission hooks to refetch /api/users/me. */
export function notifyPortalPermissionsChanged (): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(PORTAL_PERMISSIONS_CHANGED_EVENT))
}

let allowedFunctionsInflight: Promise<string[]> | null = null

function fetchAllowedFunctionsOnce(): Promise<string[]> {
  if (!allowedFunctionsInflight) {
    allowedFunctionsInflight = fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : { allowed_functions: [] }))
      .then((data) => (data.allowed_functions ?? []) as string[])
      .catch(() => [] as string[])
      .finally(() => {
        allowedFunctionsInflight = null
      })
  }
  return allowedFunctionsInflight
}

export function useAllowedFunctions(): {
  allowedFunctions: string[]
  can: (code: string) => boolean
  isLoading: boolean
  refresh: () => void
} {
  const [allowedFunctions, setAllowedFunctions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true)
    return fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : { allowed_functions: [] }))
      .then((data) => {
        setAllowedFunctions(data.allowed_functions ?? [])
      })
      .catch(() => {
        setAllowedFunctions([])
      })
      .finally(() => {
        setIsLoading(false)
      })
  }, [])

  useEffect(() => {
    let cancelled = false
    fetchAllowedFunctionsOnce()
      .then((list) => {
        if (!cancelled) setAllowedFunctions(list)
      })
      .catch(() => {
        if (!cancelled) setAllowedFunctions([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    const onChanged = () => {
      // Silent refresh keeps current nav until new data arrives (still fail-closed on first load).
      void load({ silent: true })
    }
    window.addEventListener(PORTAL_PERMISSIONS_CHANGED_EVENT, onChanged)
    return () => {
      cancelled = true
      window.removeEventListener(PORTAL_PERMISSIONS_CHANGED_EVENT, onChanged)
    }
  }, [load])

  const can = (code: string): boolean => {
    // Fail closed while permissions are unresolved — never flash unauthorized UI.
    if (isLoading) return false
    if (allowedFunctions.length === 0) return false
    return allowedFunctions.includes(code)
  }

  return {
    allowedFunctions,
    can,
    isLoading,
    refresh: () => {
      void load()
    },
  }
}
