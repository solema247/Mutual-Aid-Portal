'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useGrantManagementPageExplainer } from './GrantManagementPageExplainer'

export default function GrantManagementLayout({
  children,
}: {
  children: ReactNode
}) {
  const router = useRouter()
  const { can, isLoading } = useAllowedFunctions()
  const canView = can('grant_view')
  const [ready, setReady] = useState(false)

  useEffect(() => {
    if (isLoading) return
    if (!canView) {
      router.replace('/err-portal')
      return
    }
    setReady(true)
  }, [isLoading, canView, router])

  useGrantManagementPageExplainer(ready)

  if (!ready) return null

  return <>{children}</>
}
