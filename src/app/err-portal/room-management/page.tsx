'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CollapsibleRow } from '@/components/ui/collapsible'
import RoomManagement from './components/RoomManagement'
import { supabase } from '@/lib/supabaseClient'

interface User {
  id: string;
  auth_user_id: string;
  display_name: string;
  role: string;
  status: string;
}

export default function RoomManagementPage() {
  const { t } = useTranslation(['rooms', 'err'])
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        // Get the current session
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          window.location.href = '/login'
          return
        }

        // Get user data from users table
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .single()

        if (userError || !userData) {
          console.error('Error fetching user data:', userError)
          window.location.href = '/login'
          return
        }

        if (userData.status !== 'active') {
          console.error('User account is not active')
          window.location.href = '/login'
          return
        }

        setUser(userData)
      } catch (error) {
        console.error('Auth check error:', error)
        window.location.href = '/login'
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
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