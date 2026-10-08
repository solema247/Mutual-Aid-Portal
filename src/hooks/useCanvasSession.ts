'use client'

import { useCallback, useEffect, useState } from 'react'
import { PORTAL_PERMISSIONS_CHANGED_EVENT } from '@/hooks/useAllowedFunctions'
import { FULL_PORTAL_MOUNT_CODES } from '@/lib/canvas/types'

export type CanvasMePayload = {
  role?: string
  status?: string
  display_name?: string
  err_id?: string | null
  organization_id?: string
  organization_slug?: string
  organization_name?: string
  organization_type?: string
  environment_id?: string
  environment_slug?: string
  environment_display_name?: string
  environment_logo_url?: string | null
  environment_header_title?: string | null
  mounted_modules?: string[]
  canvas_is_fallback?: boolean
}

export function useCanvasSession(): {
  me: CanvasMePayload | null
  mountedModules: string[]
  isLoading: boolean
  refresh: () => void
} {
  const [me, setMe] = useState<CanvasMePayload | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const load = useCallback((options?: { silent?: boolean }) => {
    if (!options?.silent) setIsLoading(true)
    return fetch('/api/users/me')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMe(data)
      })
      .catch(() => {})
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    void load()
    const onChanged = () => void load({ silent: true })
    window.addEventListener(PORTAL_PERMISSIONS_CHANGED_EVENT, onChanged)
    window.addEventListener('canvas-environment-changed', onChanged)
    return () => {
      window.removeEventListener(PORTAL_PERMISSIONS_CHANGED_EVENT, onChanged)
      window.removeEventListener('canvas-environment-changed', onChanged)
    }
  }, [load])

  const mountedModules =
    me?.mounted_modules ??
    // While loading, assume full portal mounts so we don't flash empty nav; permissions still fail-closed.
    (isLoading ? [...FULL_PORTAL_MOUNT_CODES] : [])

  return {
    me,
    mountedModules,
    isLoading,
    refresh: () => void load(),
  }
}

export function notifyCanvasEnvironmentChanged(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event('canvas-environment-changed'))
}
