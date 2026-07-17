'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import PageExplainerHeader from '@/components/layout/PageExplainerHeader'
import { PageExplainerProvider } from '@/contexts/PageExplainerContext'
import type { SidebarItem, SidebarLinkItem } from '@/components/layout/Sidebar'
import { useRouter } from 'next/navigation'
import { Users, ClipboardList, BarChart2, BarChart3, PieChart, UserCog, Home, CheckSquare, BookOpen, PenTool, Cog, FileText, BookMarked, Ticket, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

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
  const [compliancePendingCount, setCompliancePendingCount] = useState<number>(0)
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

  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const canViewGrantManagement = can('grant_view')
  const canViewCompliance = can('compliance_view_page')

  useEffect(() => {
    if (permissionsLoading || !canViewCompliance) return
    let cancelled = false
    fetch('/api/compliance/queue?count_only=1')
      .then(r => (r.ok ? r.json() : { pending_count: 0 }))
      .then(data => {
        if (!cancelled) setCompliancePendingCount(data.pending_count ?? 0)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [permissionsLoading, canViewCompliance])
  const canViewF1 = can('f1_view_page')
  const canViewF2 = can('f2_view_page')
  const canViewF3 = can('f3_view_page')
  const canViewF4F5 = can('f4_f5_view_page')
  const canViewLearnings = can('learnings_view_page')
  const canViewProjectManagement = can('management_view_page')
  const canViewUserManagement = can('users_view_page')
  const canViewRooms = can('rooms_view_page')
  const canViewDashboard = can('dashboard_view_page')
  const canViewSurveys = can('surveys_view_page')
  const canRaiseTicket = can('raise_ticket_page')

  const reportingGroupChildren: SidebarLinkItem[] = []
  if (canViewF4F5) {
    reportingGroupChildren.push({
      href: '/err-portal/report-tracker',
      label: 'Report Tracker',
      icon: <BarChart3 className="h-5 w-5" />
    })
  }
  if (canViewProjectManagement) {
    reportingGroupChildren.push({
      href: '/err-portal/project-management',
      label: t('err:project_management'),
      icon: <Cog className="h-5 w-5" />
    })
  }
  if (canViewDashboard) {
    reportingGroupChildren.push({
      href: '/err-portal/dashboard',
      label: t('err:dashboard'),
      icon: <BarChart2 className="h-5 w-5" />
    })
  }
  if (canViewLearnings) {
    reportingGroupChildren.push({
      href: '/err-portal/stories',
      label: 'Mutual Aid Learnings',
      icon: <BookMarked className="h-5 w-5" />
    })
  }

  const adminGroupChildren: SidebarLinkItem[] = []
  if (canViewRooms) {
    adminGroupChildren.push({
      href: '/err-portal/room-management',
      label: t('err:room_management'),
      icon: <Users className="h-5 w-5" />
    })
  }
  if (canViewUserManagement) {
    adminGroupChildren.push({
      href: '/err-portal/user-management',
      label: t('err:user_management'),
      icon: <UserCog className="h-5 w-5" />
    })
  }
  if (canRaiseTicket) {
    adminGroupChildren.push({
      href: '/err-portal/raise-a-ticket',
      label: t('err:raise_ticket_title', 'Raise a ticket'),
      icon: <Ticket className="h-5 w-5" />
    })
  }
  if (canViewSurveys) {
    adminGroupChildren.push({
      href: '/err-portal/surveys',
      label: t('err:surveys', 'Surveys'),
      icon: <FileText className="h-5 w-5" />
    })
  }

  const sidebarItems: SidebarItem[] = [
    {
      href: '/err-portal',
      label: t('err:home'),
      icon: <Home className="h-5 w-5" />
    },
    ...(canViewGrantManagement ? [{
      href: '/err-portal/grant-management',
      label: t('err:grant_management'),
      icon: <PieChart className="h-5 w-5" />
    }] : []),
    ...(canViewF1 ? [{
      href: '/err-portal/f1-work-plans',
      label: t('err:f1_work_plans'),
      icon: <ClipboardList className="h-5 w-5" />
    }] : []),
    ...(canViewF2 ? [{
      href: '/err-portal/f2-approvals',
      label: t('err:f2_approvals'),
      icon: <CheckSquare className="h-5 w-5" />
    }] : []),
    ...(canViewF3 ? [{
      href: '/err-portal/f3-mous',
      label: 'F3 MOUs',
      icon: <PenTool className="h-5 w-5" />
    }] : []),
    ...(canViewF4F5 ? [{
      href: '/err-portal/f4-f5-reporting',
      label: 'F4 & F5 Reporting',
      icon: <BookOpen className="h-5 w-5" />
    }] : []),
    ...(canViewCompliance ? [{
      href: '/err-portal/compliance',
      label: compliancePendingCount > 0 ? `Compliance (${compliancePendingCount})` : 'Compliance',
      icon: <ShieldCheck className="h-5 w-5" />
    }] : []),
    ...(reportingGroupChildren.length > 0 ? [{
      type: 'group' as const,
      label: 'Reporting & learnings',
      children: reportingGroupChildren
    }] : []),
    ...(adminGroupChildren.length > 0 ? [{
      type: 'group' as const,
      label: 'Admin',
      children: adminGroupChildren
    }] : [])
  ]

  return (
    <PageExplainerProvider>
    <MainLayout
        sidebarItems={sidebarItems}
        headerTitle="Mutual Aid Portal"
        userName={user?.display_name ?? undefined}
        userRole={user?.role}
        headerExtra={<PageExplainerHeader />}
      >
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
    </PageExplainerProvider>
  )
}