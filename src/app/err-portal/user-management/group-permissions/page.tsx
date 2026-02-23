'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import BulkPermissionsManager from './components/BulkPermissionsManager'

interface CurrentUser {
  id: string
  role: string
  err_id: string | null
}

export default function GroupPermissionsPage() {
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
      <div className="flex items-center gap-4">
        <Button variant="outline" size="sm" asChild>
          <Link href="/err-portal/user-management" className="flex items-center gap-2">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">Bulk Permissions</h1>
      </div>
      <p className="text-muted-foreground text-sm">
        Apply the same permission overrides to multiple users at once. Select users, set Grant/Revoke for each action, then click Apply.
      </p>
      <BulkPermissionsManager
        currentUserRole={currentUser.role}
        currentUserErrId={currentUser.err_id}
      />
    </div>
  )
}
