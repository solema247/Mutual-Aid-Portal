'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Plus, Shield } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CollapsibleRow } from '@/components/ui/collapsible'
import { PendingUserListItem } from '@/app/api/users/types/users'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import PendingUsersList from './PendingUsersList'
import ActiveUsersList from './ActiveUsersList'
import AccessRightsManagement from './AccessRightsManagement'
import AddUserDialog from './AddUserDialog'
import { useUserManagementPageExplainer } from '../UserManagementPageExplainer'

interface User {
  id: string
  auth_user_id: string
  display_name: string
  role: string
  status: string
  err_id: string | null
}

export default function UserManagement() {
  const { t } = useTranslation(['users', 'common'])
  const router = useRouter()
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewPage = can('users_view_page')
  const canViewPermissionsPage = can('users_view_permissions_page')
  const canCreateUser = can('users_create')
  const [pendingUsers, setPendingUsers] = useState<PendingUserListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [addUserOpen, setAddUserOpen] = useState(false)
  const [activeListKey, setActiveListKey] = useState(0)
  useUserManagementPageExplainer(
    !permissionsLoading && canViewPage && currentUser !== null
  )

  useEffect(() => {
    if (permissionsLoading) return
    if (!canViewPage) {
      router.replace('/err-portal')
    }
  }, [permissionsLoading, canViewPage, router])

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
        setCurrentUser(userData)
      } catch (error) {
        console.error('Auth check error:', error)
        window.location.href = '/login'
      }
    }

    checkAuth()
  }, [])

  const fetchPendingUsers = useCallback(async () => {
    if (!currentUser) return

    try {
      setIsLoading(true)
      const res = await fetch('/api/users/pending')
      if (!res.ok) {
        throw new Error('Failed to fetch pending users')
      }
      const data = (await res.json()) as { users: Array<Record<string, unknown>> }
      const formattedUsers: PendingUserListItem[] = (data.users || []).map((user) => ({
        id: user.id as string,
        err_id: (user.err_id as string | null) ?? null,
        display_name: user.display_name as string,
        role: user.role as 'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err',
        createdAt: new Date((user.created_at as string) || '').toLocaleDateString(),
        status: user.status as 'pending' | 'active' | 'suspended',
        err_name:
          ((user.emergency_rooms as { name?: string } | null)?.name) || '-',
        err_code:
          ((user.emergency_rooms as { err_code?: string } | null)?.err_code) ||
          '-',
        state_name:
          (
            (
              user.emergency_rooms as {
                state?: { state_name?: string } | null
              } | null
            )?.state?.state_name
          ) || '-',
      }))
      setPendingUsers(formattedUsers)
    } catch (err) {
      setError(t('common:error_fetching_data'))
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [currentUser, t])

  useEffect(() => {
    if (currentUser) {
      fetchPendingUsers()
    }
  }, [currentUser, fetchPendingUsers])

  if (permissionsLoading) {
    return <div className="p-6 text-muted-foreground">{t('common:loading', 'Loading...')}</div>
  }
  if (!canViewPage) return null
  if (!currentUser) return null

  const isAdmin = currentUser.role === 'support' || currentUser.role === 'admin' || currentUser.role === 'superadmin'

  const refreshLists = () => {
    fetchPendingUsers()
    setActiveListKey((k) => k + 1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {t('users:user_management_title', { defaultValue: 'User Management' })}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t('users:user_management_subtitle', {
              defaultValue: 'Manage users, roles, access scope and account status.',
            })}
          </p>
        </div>
        {(canViewPermissionsPage || canCreateUser) && (
          <div className="flex flex-wrap gap-2 shrink-0">
            {canCreateUser && (
              <Button variant="default" size="sm" onClick={() => setAddUserOpen(true)}>
                <Plus className="size-4" />
                {t('users:add_user', { defaultValue: 'Add User' })}
              </Button>
            )}
            {canViewPermissionsPage && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/err-portal/user-management/permissions">
                  <Shield className="size-4" />
                  {t('users:manage_permissions', { defaultValue: 'Manage User Type Permissions' })}
                </Link>
              </Button>
            )}
          </div>
        )}
      </div>

      {canViewPermissionsPage && (
        <AccessRightsManagement
          key={activeListKey}
          currentUserRole={currentUser.role}
          currentUserErrId={currentUser.err_id}
          currentUserId={currentUser.id}
        />
      )}

      <CollapsibleRow
        title={t('users:pending_users_title')}
        defaultOpen={!isAdmin}
      >
        <div className="space-y-2">
          {error && (
            <div className="text-destructive text-sm">{error}</div>
          )}
          <PendingUsersList
            users={pendingUsers}
            isLoading={isLoading}
            onUpdate={fetchPendingUsers}
            currentUserRole={currentUser.role}
          />
        </div>
      </CollapsibleRow>

      <CollapsibleRow
        title={t('users:active_users_title')}
        defaultOpen={false}
      >
        <ActiveUsersList
          key={activeListKey}
          isLoading={false}
          currentUserRole={currentUser.role}
          currentUserErrId={currentUser.err_id}
        />
      </CollapsibleRow>

      {canCreateUser && (
        <AddUserDialog
          open={addUserOpen}
          onOpenChange={setAddUserOpen}
          currentUserRole={currentUser.role}
          onCreated={refreshLists}
        />
      )}
    </div>
  )
}
