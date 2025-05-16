'use client'

import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsibleRow } from '@/components/ui/collapsible'
import { PendingUserListItem } from '@/app/api/users/types/users'
import { getPendingUsers } from '@/app/api/users/utils/users'
import PendingUsersList from './PendingUsersList'
import ActiveUsersList from './ActiveUsersList'

export default function UserManagement() {
  const { t } = useTranslation(['users', 'common'])
  const [pendingUsers, setPendingUsers] = useState<PendingUserListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPendingUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const users = await getPendingUsers()
      const formattedUsers: PendingUserListItem[] = users.map(user => ({
        id: user.id,
        err_id: user.err_id,
        display_name: user.display_name,
        role: user.role as 'admin' | 'state_err' | 'base_err',
        createdAt: new Date(user.created_at || '').toLocaleDateString(),
        status: user.status as 'pending' | 'active' | 'suspended'
      }))
      setPendingUsers(formattedUsers)
    } catch (err) {
      setError(t('common:error_fetching_data'))
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [t])

  useEffect(() => {
    fetchPendingUsers()
  }, [fetchPendingUsers])

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
        <ActiveUsersList isLoading={false} />
      </CollapsibleRow>
    </div>
  )
} 