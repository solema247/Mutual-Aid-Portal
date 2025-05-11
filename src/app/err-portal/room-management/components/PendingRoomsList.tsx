'use client'

import { useTranslation } from 'react-i18next'
import { PendingRoomListItem } from '@/app/api/rooms/types/rooms'

interface PendingRoomsListProps {
  rooms: PendingRoomListItem[]
  isLoading: boolean
}

export default function PendingRoomsList({ rooms, isLoading }: PendingRoomsListProps) {
  const { t } = useTranslation(['rooms'])

  if (isLoading) {
    return <div className="text-muted-foreground">{t('rooms:loading')}</div>
  }

  if (rooms.length === 0) {
    return <div className="text-muted-foreground">{t('rooms:no_pending_rooms')}</div>
  }

  return (
    <div className="rounded-md border">
      <div className="grid grid-cols-5 gap-4 p-4 font-medium border-b">
        <div>{t('rooms:name')}</div>
        <div>{t('rooms:type')}</div>
        <div>{t('rooms:state')}</div>
        <div>{t('rooms:locality')}</div>
        <div>{t('rooms:created_at')}</div>
      </div>
      <div className="divide-y">
        {rooms.map((room) => (
          <div key={room.id} className="grid grid-cols-5 gap-4 p-4">
            <div>{room.name}</div>
            <div>{t(`rooms:${room.type}_type`)}</div>
            <div>{room.stateName}</div>
            <div>{room.locality}</div>
            <div>{room.createdAt}</div>
          </div>
        ))}
      </div>
    </div>
  )
} 