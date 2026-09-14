'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

/** Legacy URL — Grant Management now lives under subpages. */
export default function GrantManagementIndexPage() {
  const router = useRouter()
  const { can, isLoading } = useAllowedFunctions()

  useEffect(() => {
    if (isLoading) return
    if (can('grant_decisions_view_page')) {
      router.replace('/err-portal/grant-management/decisions')
    } else if (can('grant_grants_view_page')) {
      router.replace('/err-portal/grant-management/grants')
    } else if (can('grant_allocation_view_page')) {
      router.replace('/err-portal/grant-management/allocation-management')
    } else {
      router.replace('/err-portal')
    }
  }, [can, isLoading, router])

  return null
}
