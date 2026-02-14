'use client'

import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { PendingUserListItem } from '@/app/api/users/types/users'
import { approveUser, declineUser } from '@/app/api/users/utils/users'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

interface PendingUsersListProps {
  users: PendingUserListItem[]
  isLoading: boolean
  onUpdate: () => void
  currentUserRole: string
}

export default function PendingUsersList({ users, isLoading, onUpdate, currentUserRole }: PendingUsersListProps) {
  const { t } = useTranslation(['users', 'common'])
  const { can } = useAllowedFunctions()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleApprove = async (userId: string, userRole: string) => {
    try {
      setProcessingId(userId)
      setError(null)
      await approveUser(userId, currentUserRole)
      onUpdate()
    } catch (error: any) {
      console.error('Failed to approve user:', error)
      setError(error.message || 'Failed to approve user')
      setTimeout(() => setError(null), 5000)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDecline = async (userId: string, userRole: string) => {
    try {
      setProcessingId(userId)
      setError(null)
      await declineUser(userId, currentUserRole)
      onUpdate()
    } catch (error: any) {
      console.error('Failed to decline user:', error)
      setError(error.message || 'Failed to decline user')
      setTimeout(() => setError(null), 5000)
    } finally {
      setProcessingId(null)
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">{t('users:loading')}</div>
  }

  if (users.length === 0) {
    return <div className="text-muted-foreground">{t('users:no_pending_users')}</div>
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="text-destructive text-sm bg-destructive/10 p-3 rounded-md">{error}</div>
      )}
      <div className="rounded-md border">
        <div className="grid grid-cols-7 gap-4 p-4 font-medium border-b">
        <div>{t('users:err_name')}</div>
        <div>{t('users:state')}</div>
        <div>{t('users:display_name')}</div>
        <div>{t('users:role')}</div>
        <div>{t('users:status')}</div>
        <div>{t('users:created_at')}</div>
        <div>{t('users:actions')}</div>
      </div>
      <div className="divide-y">
        {users.map((user) => (
          <div key={user.id} className="grid grid-cols-7 gap-4 p-4">
            <div>{user.err_name || '-'}</div>
            <div>{user.state_name || '-'}</div>
            <div>{user.display_name || '-'}</div>
            <div>{t(`users:${user.role}_role`)}</div>
            <div>{t(`users:${user.status}_status`)}</div>
            <div>{user.createdAt}</div>
            <div className="flex gap-2">
              <button 
                className="text-green-600 hover:text-green-800 disabled:opacity-50"
                title={!can('users_approve') ? t('common:no_permission') : t('users:approve')}
                onClick={() => handleApprove(user.id, user.role)}
                disabled={processingId === user.id || !can('users_approve')}
              >
                {processingId === user.id ? '...' : '✓'}
              </button>
              {can('users_decline') && (
                <button 
                  className="text-red-600 hover:text-red-800 disabled:opacity-50"
                  title={t('users:decline')}
                  onClick={() => handleDecline(user.id, user.role)}
                  disabled={processingId === user.id}
                >
                  {processingId === user.id ? '...' : '✕'}
                </button>
              )}
            </div>
          </div>
        ))}
        </div>
      </div>
    </div>
  )
} 