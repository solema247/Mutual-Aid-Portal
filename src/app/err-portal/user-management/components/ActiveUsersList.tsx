'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ActiveUserListItem } from '@/app/api/users/types/users'
import { getActiveUsers, suspendUser, activateUser } from '@/app/api/users/utils/users'

interface ActiveUsersListProps {
  isLoading: boolean;
  currentUserRole: string;
  currentUserErrId: string | null;
}

export default function ActiveUsersList({ 
  isLoading: initialLoading,
  currentUserRole,
  currentUserErrId
}: ActiveUsersListProps) {
  const { t } = useTranslation(['users', 'common'])
  const [users, setUsers] = useState<ActiveUserListItem[]>([])
  const [isLoading, setIsLoading] = useState(initialLoading)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'suspended'>('active')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const { users: fetchedUsers } = await getActiveUsers({
        page: 1,
        pageSize: 20,
        role: selectedRole === 'all' ? undefined : selectedRole as 'admin' | 'state_err' | 'base_err',
        status: selectedStatus,
        sortOrder,
        currentUserRole,
        currentUserErrId
      })

      const formattedUsers: ActiveUserListItem[] = fetchedUsers.map(user => ({
        id: user.id,
        err_id: user.err_id,
        display_name: user.display_name,
        role: user.role as 'admin' | 'state_err' | 'base_err',
        status: user.status as 'active' | 'suspended',
        createdAt: new Date(user.created_at || '').toLocaleDateString(),
        updatedAt: user.updated_at ? new Date(user.updated_at).toLocaleDateString() : null,
        err_name: user.emergency_rooms?.name || '-',
        err_code: user.emergency_rooms?.err_code || '-',
        state_name: user.emergency_rooms?.state?.state_name || '-',
        can_see_all_states: user.can_see_all_states ?? true,
        visible_states: user.visible_states || []
      }))

      setUsers(formattedUsers)
    } catch (err) {
      setError(t('common:error_fetching_data'))
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [selectedRole, selectedStatus, sortOrder, currentUserRole, currentUserErrId, t])

  useEffect(() => {
    fetchUsers()
  }, [selectedRole, selectedStatus, sortOrder, fetchUsers])

  const handleStatusChange = async (userId: string, newStatus: 'active' | 'suspended') => {
    try {
      setProcessingId(userId)
      if (newStatus === 'suspended') {
        await suspendUser(userId)
      } else {
        await activateUser(userId)
      }
      fetchUsers()
    } catch (error) {
      console.error(t('common:error_updating_user_status'), error)
    } finally {
      setProcessingId(null)
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">{t('users:loading')}</div>
  }

  if (error) {
    return <div className="text-destructive text-sm">{error}</div>
  }

  if (users.length === 0) {
    return <div className="text-muted-foreground">{t('users:no_active_users')}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <Select
          value={selectedRole}
          onValueChange={setSelectedRole}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('users:filter_by_role')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users:all_roles')}</SelectItem>
            <SelectItem value="admin">{t('users:admin_role')}</SelectItem>
            <SelectItem value="state_err">{t('users:state_err_role')}</SelectItem>
            <SelectItem value="base_err">{t('users:base_err_role')}</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={selectedStatus}
          onValueChange={(value) => setSelectedStatus(value as 'active' | 'suspended')}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('users:filter_by_status')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t('users:active_status')}</SelectItem>
            <SelectItem value="suspended">{t('users:suspended_status')}</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {sortOrder === 'asc' ? t('users:sort_desc') : t('users:sort_asc')}
        </button>
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-8 gap-4 p-4 font-medium border-b">
          <div>{t('users:err_name')}</div>
          <div>{t('users:state')}</div>
          <div>{t('users:display_name')}</div>
          <div>{t('users:role')}</div>
          <div>{t('users:status')}</div>
          <div>{t('users:created_at')}</div>
          <div>{t('users:updated_at')}</div>
          <div>{t('users:actions')}</div>
        </div>
        <div className="divide-y">
          {users.map((user) => (
            <div key={user.id} className="grid grid-cols-8 gap-4 p-4">
              <div>{user.err_name || '-'}</div>
              <div>{user.state_name || '-'}</div>
              <div>{user.display_name || '-'}</div>
              <div>{t(`users:${user.role}_role`)}</div>
              <div>{t(`users:${user.status}_status`)}</div>
              <div>{user.createdAt}</div>
              <div>{user.updatedAt || '-'}</div>
              <div>
                <button
                  className={`${
                    user.status === 'active' ? 'text-red-600 hover:text-red-800' : 'text-green-600 hover:text-green-800'
                  } disabled:opacity-50`}
                  title={t(user.status === 'active' ? 'users:suspend' : 'users:activate')}
                  onClick={() => handleStatusChange(user.id, user.status === 'active' ? 'suspended' : 'active')}
                  disabled={processingId === user.id}
                >
                  {processingId === user.id ? '...' : user.status === 'active' ? '⊘' : '✓'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
} 