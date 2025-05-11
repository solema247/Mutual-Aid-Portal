'use client'

import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { PendingRoomListItem } from '@/app/api/rooms/types/rooms'
import { approveRoom, declineRoom } from '@/app/api/rooms/utils/rooms'

interface PendingRoomsListProps {
  rooms: PendingRoomListItem[]
  isLoading: boolean
  onUpdate: () => void
}

export default function PendingRoomsList({ rooms, isLoading, onUpdate }: PendingRoomsListProps) {
  const { t } = useTranslation(['rooms'])
  const [processingId, setProcessingId] = useState<string | null>(null)

  const handleApprove = async (roomId: string) => {
    try {
      setProcessingId(roomId)
      await approveRoom(roomId)
      onUpdate()
    } catch (error) {
      console.error('Failed to approve room:', error)
    } finally {
      setProcessingId(null)
    }
  }

  const handleDecline = async (roomId: string) => {
    try {
      setProcessingId(roomId)
      await declineRoom(roomId)
      onUpdate()
    } catch (error) {
      console.error('Failed to decline room:', error)
    } finally {
      setProcessingId(null)
    }
  }

  if (isLoading) {
    return <div className="text-muted-foreground">{t('rooms:loading')}</div>
  }

  if (rooms.length === 0) {
    return <div className="text-muted-foreground">{t('rooms:no_pending_rooms')}</div>
  }

  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-6 gap-4 p-4 font-medium border-b">
        <div>{t('rooms:name')}</div>
        <div>{t('rooms:type')}</div>
        <div>{t('rooms:state')}</div>
        <div>{t('rooms:locality')}</div>
        <div>{t('rooms:created_at')}</div>
        <div>{t('rooms:actions')}</div>
      </div>
      <div className="divide-y">
        {rooms.map((room) => (
          <div key={room.id} className="grid grid-cols-6 gap-4 p-4">
            <div>{room.name}</div>
            <div>{t(`rooms:${room.type}_type`)}</div>
            <div>{room.stateName}</div>
            <div>{room.locality}</div>
            <div>{room.createdAt}</div>
            <div className="flex gap-2">
              <button 
                className="text-green-600 hover:text-green-800 disabled:opacity-50"
                title={t('rooms:accept')}
                onClick={() => handleApprove(room.id)}
                disabled={processingId === room.id}
              >
                {processingId === room.id ? '...' : '✓'}
              </button>
              <button 
                className="text-red-600 hover:text-red-800 disabled:opacity-50"
                title={t('rooms:decline')}
                onClick={() => handleDecline(room.id)}
                disabled={processingId === room.id}
              >
                {processingId === room.id ? '...' : '✕'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
} 