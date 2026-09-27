'use client'

import { useEffect, useState } from 'react'

/**
 * Base ERR users are scoped to users.err_id, so room pickers must offer that room only.
 * Returns lockedRoomId = null for every other role, so callers keep their existing picker.
 */
export function useBaseErrRoomId(): { lockedRoomId: string | null; loading: boolean } {
  const [lockedRoomId, setLockedRoomId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        const res = await fetch('/api/users/me')
        if (!res.ok) return
        const me = await res.json()
        if (cancelled) return
        if (me?.role === 'base_err' && me?.err_id) {
          setLockedRoomId(String(me.err_id))
        }
      } catch (e) {
        console.error('Failed to resolve Base ERR room scope:', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  return { lockedRoomId, loading }
}
