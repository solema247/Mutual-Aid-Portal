'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useGrantManagementPageExplainer } from './GrantManagementPageExplainer'

const PAGE_PERMISSIONS: { suffix: string; code: string }[] = [
  { suffix: '/decisions', code: 'grant_decisions_view_page' },
  { suffix: '/grants', code: 'grant_grants_view_page' },
  { suffix: '/allocation-management', code: 'grant_allocation_view_page' },
]

export default function GrantManagementLayout({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const pathname = usePathname()
  const { can, isLoading } = useAllowedFunctions()
  const canViewDecisions = can('grant_decisions_view_page')
  const canViewGrants = can('grant_grants_view_page')
  const canViewAllocation = can('grant_allocation_view_page')
  const canViewAny = canViewDecisions || canViewGrants || canViewAllocation
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!canViewAny) {
      router.replace('/err-portal')
      return
    }

    const required = PAGE_PERMISSIONS.find((p) => pathname?.endsWith(p.suffix))
    if (required && !can(required.code)) {
      const fallback = canViewDecisions
        ? '/err-portal/grant-management/decisions'
        : canViewGrants
          ? '/err-portal/grant-management/grants'
          : '/err-portal/grant-management/allocation-management'
      router.replace(fallback)
      return
    }

    setReady(true)
  }, [
    isLoading,
    canViewAny,
    canViewDecisions,
    canViewGrants,
    canViewAllocation,
    pathname,
    can,
    router,
  ])

  useGrantManagementPageExplainer(ready)

  if (!ready) return null

  return <>{children}</>
}
