'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { Users, FileUp } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'

interface User {
  id: string;
  auth_user_id: string;
  display_name: string;
  role: string;
  status: string;
  err_id: string | null;
}

export default function ErrPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation(['err'])
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const getUser = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        const { data: userData } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .single()
        
        if (userData) {
          setUser(userData)
        }
      }
    }
    getUser()
  }, [])

  const canManageRooms = user?.role === 'admin' || user?.role === 'state_err'

  const sidebarItems = [
    {
      href: '/err-portal',
      label: t('err:home'),
      icon: '🏠'
    },
    ...(canManageRooms ? [{
      href: '/err-portal/room-management',
      label: t('err:room_management'),
      icon: '🤝'
    }] : []),
    {
      href: '/err-portal/user-management',
      label: t('err:user_management'),
      icon: <Users className="h-5 w-5" />
    },
    {
      href: '/err-portal/project-management',
      label: t('err:project_management'),
      icon: '📋'
    },
    {
      href: '/err-portal/dashboard',
      label: t('err:dashboard'),
      icon: '📈'
    },
    {
      href: '/err-portal/fsystem-upload',
      label: t('err:fsystem_upload'),
      icon: <FileUp className="h-5 w-5" />
    }
  ]

  return <MainLayout sidebarItems={sidebarItems}>{children}</MainLayout>
} 