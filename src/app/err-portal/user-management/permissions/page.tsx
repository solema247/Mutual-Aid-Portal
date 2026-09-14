'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import RolePermissionsManager from './components/RolePermissionsManager'

export default function PermissionsPage() {
  const router = useRouter()
  const { can, isLoading } = useAllowedFunctions()
  const canViewPage = can('users_view_permissions_page')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!canViewPage) {
      router.replace('/err-portal/user-management')
      return
    }
    setReady(true)
  }, [canViewPage, isLoading, router])

  if (!ready) {
    return <div className="p-3 text-xs text-muted-foreground">Loading...</div>
  }

  return (
    <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden">
      <div className="flex min-w-0 items-center gap-2">
        <Button variant="outline" size="sm" className="h-7 shrink-0 px-2 text-xs" asChild>
          <Link href="/err-portal/user-management" className="flex items-center gap-1.5">
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </Link>
        </Button>
        <div className="min-w-0">
          <h1 className="text-base font-semibold leading-tight">Permissions</h1>
          <p className="text-xs text-muted-foreground leading-snug">
            Type defaults and individual exceptions.
          </p>
        </div>
      </div>
      <Suspense fallback={<div className="text-xs text-muted-foreground">Loading…</div>}>
        <RolePermissionsManager />
      </Suspense>
    </div>
  )
}
