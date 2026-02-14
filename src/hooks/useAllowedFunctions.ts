'use client'

import { useEffect, useState } from 'react'

/**
 * Fetches current user's allowed_functions from /api/users/me and provides can(code).
 * Use to disable/hide action buttons when the user lacks the permission.
 */
export function useAllowedFunctions(): {
  allowedFunctions: string[]
  can: (code: string) => boolean
  isLoading: boolean
} {
  const [allowedFunctions, setAllowedFunctions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    const fetchMe = async () => {
      try {
        const res = await fetch('/api/users/me')
        if (cancelled) return
        if (res.ok) {
          const data = await res.json()
          setAllowedFunctions(data.allowed_functions ?? [])
        }
      } catch (e) {
        if (!cancelled) setAllowedFunctions([])
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }
    fetchMe()
    return () => {
      cancelled = true
    }
  }, [])

  const can = (code: string): boolean => {
    if (allowedFunctions.length === 0 && isLoading) return true
    if (allowedFunctions.length === 0) return false
    return allowedFunctions.includes(code)
  }

  return { allowedFunctions, can, isLoading }
}
