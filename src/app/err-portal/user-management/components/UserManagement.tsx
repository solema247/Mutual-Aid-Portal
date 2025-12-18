'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsibleRow } from '@/components/ui/collapsible'
import { PendingUserListItem } from '@/app/api/users/types/users'
import { getPendingUsers } from '@/app/api/users/utils/users'
import PendingUsersList from './PendingUsersList'
import ActiveUsersList from './ActiveUsersList'
import { supabase } from '@/lib/supabaseClient'

interface User {
  id: string;
  auth_user_id: string;
  display_name: string;
  role: string;
  status: string;
  err_id: string | null;
}

export default function UserManagement() {
  const { t } = useTranslation(['users', 'common'])
  const [pendingUsers, setPendingUsers] = useState<PendingUserListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentUser, setCurrentUser] = useState<User | null>(null)

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
      const users = await getPendingUsers(currentUser.role, currentUser.err_id)
      const formattedUsers: PendingUserListItem[] = users.map(user => ({
        id: user.id,
        err_id: user.err_id,
        display_name: user.display_name,
        role: user.role as 'admin' | 'state_err' | 'base_err',
        createdAt: new Date(user.created_at || '').toLocaleDateString(),
        status: user.status as 'pending' | 'active' | 'suspended',
        err_name: user.emergency_rooms?.name || '-',
        err_code: user.emergency_rooms?.err_code || '-',
        state_name: user.emergency_rooms?.state?.state_name || '-'
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

  if (!currentUser) return null

  return (
    <div className="space-y-6">
      <CollapsibleRow
        title={t('users:pending_users_title')}
        variant="primary"
        defaultOpen={true}
      >
        <div className="space-y-4">
          {error && (
            <div className="text-destructive text-sm">{error}</div>
          )}
          <PendingUsersList
            users={pendingUsers}
            isLoading={isLoading}
            onUpdate={fetchPendingUsers}
          />
        </div>
      </CollapsibleRow>

      <CollapsibleRow
        title={t('users:active_users_title')}
        defaultOpen={false}
      >
        <ActiveUsersList 
          isLoading={false}
          currentUserRole={currentUser.role}
          currentUserErrId={currentUser.err_id}
        />
      </CollapsibleRow>
    </div>
  )
} 