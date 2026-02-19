'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import PermissionsManager from './components/PermissionsManager'

export default function PermissionsPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const userIdFromUrl = searchParams.get('userId')
  const [currentUser, setCurrentUser] = useState<{ id: string; role: string; err_id: string | null } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch('/api/users/me')
        if (!res.ok) {
          if (res.status === 401) {
            router.replace('/login')
            return
          }
          throw new Error('Failed to fetch user')
        }
        const data = await res.json()
        if (data.role !== 'admin' && data.role !== 'superadmin') {
          router.replace('/err-portal/user-management')
          return
        }
        setCurrentUser({ id: data.id, role: data.role, err_id: data.err_id })
      } catch (e) {
        router.replace('/login')
      } finally {
        setLoading(false)
      }
    }
    check()
  }, [router])

  if (loading || !currentUser) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Function Permissions</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage which users can perform which actions. Role defaults apply first; overrides add or remove permissions.
        </p>
      </div>
      <PermissionsManager
        currentUserRole={currentUser.role}
        currentUserErrId={currentUser.err_id}
        initialUserId={userIdFromUrl}
      />
    </div>
  )
}
