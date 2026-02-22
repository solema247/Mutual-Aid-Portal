'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PermissionsManager from './components/PermissionsManager'

interface CurrentUser {
  id: string
  role: string
  err_id: string | null
}

export default function PermissionsPage() {
  const router = useRouter()
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/users/me')
      .then((r) => {
        if (!r.ok) throw new Error('Not ok')
        return r.json()
      })
      .then((data) => {
        if (cancelled) return
        const role = data.role
        if (role !== 'admin' && role !== 'superadmin') {
          router.replace('/err-portal/user-management')
          return
        }
        setCurrentUser({
          id: data.id,
          role: data.role,
          err_id: data.err_id ?? null
        })
      })
      .catch(() => {
        if (!cancelled) router.replace('/err-portal/user-management')
      })
      .finally(() => {
        if (!cancelled) setChecking(false)
      })
    return () => {
      cancelled = true
    }
  }, [router])

  if (checking || !currentUser) {
    return <div className="p-6 text-muted-foreground">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Function Permissions</h1>
      <PermissionsManager
        currentUserRole={currentUser.role}
        currentUserErrId={currentUser.err_id}
      />
    </div>
  )
}
