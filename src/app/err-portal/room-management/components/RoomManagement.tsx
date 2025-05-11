'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsibleRow } from '@/components/ui/collapsible'
import { PendingRoomListItem } from '@/app/api/rooms/types/rooms'
import { getPendingRooms } from '@/app/api/rooms/utils/rooms'
import PendingRoomsList from './PendingRoomsList'
import ActiveRoomsList from './ActiveRoomsList'

export default function RoomManagement() {
  const { t } = useTranslation(['rooms'])
  const [pendingRooms, setPendingRooms] = useState<PendingRoomListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchPendingRooms = async () => {
    try {
      setIsLoading(true)
      const rooms = await getPendingRooms()
      const formattedRooms: PendingRoomListItem[] = rooms.map(room => ({
        id: room.id,
        name: room.name,
        type: room.type as 'state' | 'base',
        stateName: room.state?.state_name || '',
        locality: room.state?.locality || '',
        createdAt: new Date(room.created_at || '').toLocaleDateString(),
        status: room.status as 'active' | 'inactive'
      }))
      setPendingRooms(formattedRooms)
    } catch (err) {
      setError('Failed to fetch pending rooms')
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingRooms()
  }, [])

  return (
    <div className="space-y-6">
      <CollapsibleRow
        title={t('rooms:pending_rooms_title')}
        variant="primary"
        defaultOpen={true}
      >
        <div className="space-y-4">
          {error && (
            <div className="text-destructive text-sm">{error}</div>
          )}
          <PendingRoomsList
            rooms={pendingRooms}
            isLoading={isLoading}
            onUpdate={fetchPendingRooms}
          />
        </div>
      </CollapsibleRow>

      <CollapsibleRow
        title={t('rooms:active_rooms_title')}
        defaultOpen={false}
      >
        <ActiveRoomsList isLoading={false} />
      </CollapsibleRow>
    </div>
  )
} 