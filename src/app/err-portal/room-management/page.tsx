'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsibleRow } from '@/components/ui/collapsible'
import RoomManagement from './components/RoomManagement'

interface User {
  role: string;
}

export default function RoomManagementPage() {
  const { t } = useTranslation(['rooms', 'err'])
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    setIsLoading(false)
  }, [])

  if (isLoading) return <div>Loading...</div>

  // Only show room management for admin users
  if (user?.role !== 'admin') {
    return (
      <div className="text-center text-muted-foreground">
        {t('rooms:no_access')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {t('err:room_management')}
        </h1>
      </div>

      <div className="space-y-4">
        <RoomManagement />

        <CollapsibleRow
          title={t('rooms:inactive_rooms_title')}
          defaultOpen={false}
        >
          <div className="p-4 text-muted-foreground">
            {t('rooms:coming_soon')}
          </div>
        </CollapsibleRow>
      </div>
    </div>
  )
} 