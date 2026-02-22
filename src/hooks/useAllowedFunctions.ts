'use client'

import { useEffect, useState } from 'react'

export function useAllowedFunctions(): {
  allowedFunctions: string[]
  can: (code: string) => boolean
  isLoading: boolean
} {
  const [allowedFunctions, setAllowedFunctions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : { allowed_functions: [] }))
      .then((data) => {
        if (!cancelled) setAllowedFunctions(data.allowed_functions ?? [])
      })
      .catch(() => {
        if (!cancelled) setAllowedFunctions([])
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })
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
