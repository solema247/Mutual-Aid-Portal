'use client'

import { useEffect, useState } from 'react'

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
} {
  const [allowedFunctions, setAllowedFunctions] = useState<string[]>([])
  const [isLoading, setIsLoading] = useState(true)
  useEffect(() => {
    let cancelled = false
    fetchAllowedFunctionsOnce()
      .then((list) => {
        if (!cancelled) setAllowedFunctions(list)
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
