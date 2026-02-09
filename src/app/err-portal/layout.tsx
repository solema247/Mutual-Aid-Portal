'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import { useRouter } from 'next/navigation'
import { Users, FileText, ClipboardList, BarChart2, PieChart, UserCog, Home, CheckSquare, BookOpen, PenTool, Cog } from 'lucide-react'
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
  const [minimizedType, setMinimizedType] = useState<'f4'|'f5'|null>(null)
  const router = useRouter()

  useEffect(() => {
    const getUser = async () => {
      try {
        const res = await fetch('/api/users/me')
        if (res.ok) {
          const userData = await res.json()
          setUser(userData)
        }
      } catch (error) {
        console.error('Error fetching user:', error)
      }
    }
    getUser()
  }, [])

  // Watch localStorage to show minimized upload bar across pages
  useEffect(() => {
    const read = () => {
      try {
        const v = (typeof window !== 'undefined') ? window.localStorage.getItem('err_minimized_modal') : null
        if (v === 'f4' || v === 'f5') setMinimizedType(v)
        else setMinimizedType(null)
      } catch {}
    }
    read()
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'err_minimized_modal') read()
    }
    const onCustom = (_e: any) => read()
    window.addEventListener('storage', onStorage)
    window.addEventListener('err_minimized_modal_change', onCustom as any)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const canManageRooms = user?.role === 'admin' || user?.role === 'superadmin' || user?.role === 'state_err'

  const sidebarItems = [
    {
      href: '/err-portal',
      label: t('err:home'),
      icon: <Home className="h-5 w-5" />
    },
    {
      href: '/err-portal/grant-management',
      label: t('err:grant_management'),
      icon: <PieChart className="h-5 w-5" />
    },
    {
      href: '/err-portal/f1-work-plans',
      label: t('err:f1_work_plans'),
      icon: <ClipboardList className="h-5 w-5" />
    },
    {
      href: '/err-portal/f2-approvals',
      label: t('err:f2_approvals'),
      icon: <CheckSquare className="h-5 w-5" />
    },
    {
      href: '/err-portal/f3-mous',
      label: 'F3 MOUs',
      icon: <PenTool className="h-5 w-5" />
    },
    {
      href: '/err-portal/f4-f5-reporting',
      label: 'F4 & F5 Reporting',
      icon: <BookOpen className="h-5 w-5" />
    },
    {
      href: '/err-portal/project-management',
      label: t('err:project_management'),
      icon: <Cog className="h-5 w-5" />
    },
    {
      href: '/err-portal/dashboard',
      label: t('err:dashboard'),
      icon: <BarChart2 className="h-5 w-5" />
    },
    ...(canManageRooms ? [{
      href: '/err-portal/room-management',
      label: t('err:room_management'),
      icon: <Users className="h-5 w-5" />
    }] : []),
    {
      href: '/err-portal/user-management',
      label: t('err:user_management'),
      icon: <UserCog className="h-5 w-5" />
    }
  ]

  return (
    <MainLayout sidebarItems={sidebarItems} userName={user?.display_name ?? undefined}>
      {children}
      {minimizedType && (
        <div className="fixed bottom-4 right-4 z-50 w-80 rounded border bg-background shadow-lg">
          <div className="flex items-center justify-between px-3 py-2">
            <div className="text-sm font-medium">{minimizedType === 'f4' ? 'F4 Financial Report' : 'F5 Program Report'}</div>
            <div className="flex items-center gap-2">
              <button
                className="h-7 px-2 text-sm rounded border"
                onClick={() => {
                  try { window.localStorage.setItem('err_restore', String(minimizedType)) } catch {}
                  router.push(`/err-portal/f4-f5-reporting?restore=${minimizedType}`)
                }}
              >Restore</button>
              <button
                className="h-7 px-2 text-sm rounded"
                onClick={() => { try { window.localStorage.removeItem('err_minimized_modal') } catch {}; setMinimizedType(null) }}
              >X</button>
            </div>
          </div>
        </div>
      )}
    </MainLayout>
  )
}