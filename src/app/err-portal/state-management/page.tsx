'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { isStateManagementRole } from '@/lib/stateManagement/roles'
import { useStateManagementPageExplainer } from './StateManagementPageExplainer'
import StateManagement from './components/StateManagement'

interface User {
  id: string
  role: string
  status: string
}

export default function StateManagementPage() {
  const { t } = useTranslation(['states', 'err'])
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('states_view_page')
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const allowed =
    !permissionsLoading &&
    canViewPage &&
    !isLoading &&
    user != null &&
    isStateManagementRole(user.role)

  useStateManagementPageExplainer(allowed)

  useEffect(() => {
    if (permissionsLoading) return
    if (!canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, permissionsLoading, router])

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/users/me')
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login'
            return
          }
          throw new Error('Failed to fetch user data')
        }
        const userData = await res.json()
        setUser(userData)
      } catch (error) {
        console.error('Auth check error:', error)
        window.location.href = '/login'
      } finally {
        setIsLoading(false)
      }
    }
    checkAuth()
  }, [])

  if (permissionsLoading || isLoading) {
    return <div>{t('states:loading')}</div>
  }
  if (!canViewPage) return null

  if (!isStateManagementRole(user?.role)) {
    return (
      <div className="text-center text-muted-foreground">
        {t('states:no_access')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {t('err:state_management')}
        </h1>
      </div>
      <StateManagement />
    </div>
  )
}
