'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { Select } from '@/components/ui/select'
import { ActiveUserListItem } from '@/app/api/users/types/users'
import { getActiveUsers, suspendUser, activateUser } from '@/app/api/users/utils/users'

interface ActiveUsersListProps {
  isLoading: boolean
}

export default function ActiveUsersList({ isLoading: initialLoading }: ActiveUsersListProps) {
  const { t } = useTranslation(['users', 'common'])
  const [users, setUsers] = useState<ActiveUserListItem[]>([])
  const [isLoading, setIsLoading] = useState(initialLoading)
  const [error, setError] = useState<string | null>(null)
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [totalUsers, setTotalUsers] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [selectedStatus, setSelectedStatus] = useState<'active' | 'suspended'>('active')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  const fetchUsers = async () => {
    try {
      setIsLoading(true)
      const { users: fetchedUsers, total } = await getActiveUsers({
        page,
        pageSize: 20,
        role: selectedRole === 'all' ? undefined : selectedRole as 'admin' | 'state_err' | 'base_err',
        status: selectedStatus,
        sortOrder
      })

      const formattedUsers: ActiveUserListItem[] = fetchedUsers.map(user => ({
        id: user.id,
        err_id: user.err_id,
        display_name: user.display_name,
        role: user.role as 'admin' | 'state_err' | 'base_err',
        status: user.status as 'active' | 'suspended',
        createdAt: new Date(user.created_at || '').toLocaleDateString(),
        updatedAt: user.updated_at ? new Date(user.updated_at).toLocaleDateString() : null
      }))

      setUsers(formattedUsers)
      setTotalUsers(total)
    } catch (err) {
      setError(t('common:error_fetching_data'))
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [page, selectedRole, selectedStatus, sortOrder])

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
          items={[
            { value: 'all', label: t('users:all_roles') },
            { value: 'admin', label: t('users:admin_role') },
            { value: 'state_err', label: t('users:state_err_role') },
            { value: 'base_err', label: t('users:base_err_role') }
          ]}
          placeholder={t('users:filter_by_role')}
        />
        <Select
          value={selectedStatus}
          onValueChange={(value) => setSelectedStatus(value as 'active' | 'suspended')}
          items={[
            { value: 'active', label: t('users:active_status') },
            { value: 'suspended', label: t('users:suspended_status') }
          ]}
          placeholder={t('users:filter_by_status')}
        />
        <button
          onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {sortOrder === 'asc' ? t('users:sort_desc') : t('users:sort_asc')}
        </button>
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-7 gap-4 p-4 font-medium border-b">
          <div>{t('users:err_id')}</div>
          <div>{t('users:display_name')}</div>
          <div>{t('users:role')}</div>
          <div>{t('users:status')}</div>
          <div>{t('users:created_at')}</div>
          <div>{t('users:updated_at')}</div>
          <div>{t('users:actions')}</div>
        </div>
        <div className="divide-y">
          {users.map((user) => (
            <div key={user.id} className="grid grid-cols-7 gap-4 p-4">
              <div>{user.err_id || '-'}</div>
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