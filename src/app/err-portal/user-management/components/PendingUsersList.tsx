'use client'

import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { PendingUserListItem } from '@/app/api/users/types/users'
import { approveUser, declineUser } from '@/app/api/users/utils/users'

interface PendingUsersListProps {
  users: PendingUserListItem[]
  isLoading: boolean
  onUpdate: () => void
}

export default function PendingUsersList({ users, isLoading, onUpdate }: PendingUsersListProps) {
  const { t } = useTranslation(['users'])
  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleApprove = async (userId: string) => {
    try {
      setProcessingId(userId)
      await approveUser(userId)
      onUpdate()
    } catch (error) {
      console.error('Failed to approve user:', error)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDecline = async (userId: string) => {
    try {
      setProcessingId(userId)
      await declineUser(userId)
      onUpdate()
    } catch (error) {
      console.error('Failed to decline user:', error)
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
    <div className="rounded-md border">
      <div className="grid grid-cols-6 gap-4 p-4 font-medium border-b">
        <div>{t('users:err_id')}</div>
        <div>{t('users:display_name')}</div>
        <div>{t('users:role')}</div>
        <div>{t('users:status')}</div>
        <div>{t('users:created_at')}</div>
        <div>{t('users:actions')}</div>
      </div>
      <div className="divide-y">
        {users.map((user) => (
          <div key={user.id} className="grid grid-cols-6 gap-4 p-4">
            <div>{user.err_id || '-'}</div>
            <div>{user.display_name || '-'}</div>
            <div>{t(`users:${user.role}_role`)}</div>
            <div>{t(`users:${user.status}_status`)}</div>
            <div>{user.createdAt}</div>
            <div className="flex gap-2">
              <button 
                className="text-green-600 hover:text-green-800 disabled:opacity-50"
                title={t('users:approve')}
                onClick={() => handleApprove(user.id)}
                disabled={processingId === user.id}
              >
                {processingId === user.id ? '...' : '✓'}
              </button>
              <button 
                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                title={t('users:decline')}
                onClick={() => handleDecline(user.id)}
                disabled={processingId === user.id}
              >
                {processingId === user.id ? '...' : '✕'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 