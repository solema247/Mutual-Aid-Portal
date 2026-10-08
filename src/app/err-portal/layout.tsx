'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import MainLayout from '@/components/layout/MainLayout'
import PortalPageTransition from '@/components/PortalPageTransition'
import PageExplainerHeader from '@/components/layout/PageExplainerHeader'
import { PageExplainerProvider } from '@/contexts/PageExplainerContext'
import type { SidebarItem, SidebarLinkItem } from '@/components/layout/Sidebar'
import { useRouter } from 'next/navigation'
import { Users, ClipboardList, BarChart2, BarChart3, PieChart, UserCog, Home, CheckSquare, BookOpen, PenTool, Cog, FileText, BookMarked, Ticket, ShieldCheck, Archive, Split, ArrowLeftRight, LayoutDashboard, MapPin, ScrollText, Layers, Eye, Inbox } from 'lucide-react'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useCanvasSession } from '@/hooks/useCanvasSession'
import { isModuleMounted } from '@/lib/canvas/mounts'
import { isLocalizationHubOrg } from '@/lib/canvas/orgBrand'
import { isStateManagementRole } from '@/lib/stateManagement/roles'
import { canViewAuditLogUi } from '@/lib/auditLogAccess'

export default function ErrPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation(['err'])
  const { me: user, mountedModules, isLoading: canvasLoading } = useCanvasSession()
  const [minimizedType, setMinimizedType] = useState<'f4'|'f5'|null>(null)
  const [compliancePendingCount, setCompliancePendingCount] = useState<number>(0)
  const router = useRouter()

  const mounted = (code: string) => isModuleMounted(mountedModules, code)

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
  const canViewGrantDecisions = can('grant_decisions_view_page') && mounted('grant_decisions')
  const canViewGrantGrants = can('grant_grants_view_page') && mounted('grant_grants')
  const canViewGrantAllocation = can('grant_allocation_view_page') && mounted('grant_allocation')
  const canViewCompliance = can('compliance_view_page') && mounted('compliance')

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
  const canViewF1 = can('f1_view_page') && mounted('f1_workplans')
  const canViewF2 = can('f2_view_page') && mounted('f2_approvals')
  const canViewF3 = can('f3_view_page') && mounted('f3_mous')
  const canViewF4F5 = can('f4_f5_view_page') && mounted('f4_f5_reporting')
  const canViewLearnings = can('learnings_view_page') && mounted('learnings')
  const canViewProjectManagement = can('management_view_page') && mounted('project_management')
  const canViewUserManagement = can('users_view_page') && mounted('user_management')
  const canViewRooms = can('rooms_view_page') && mounted('room_management')
  const canViewStates =
    can('states_view_page') && mounted('state_management') && isStateManagementRole(user?.role)
  const canViewDashboard = can('dashboard_view_page') && mounted('dashboard')
  const canViewSurveys = can('surveys_view_page') && mounted('surveys')
  const canRaiseTicket = can('raise_ticket_page') && mounted('raise_ticket')
  const canViewTicketDashboard = can('ticket_dashboard_view_page') && mounted('ticket_dashboard')
  const canViewDataArchive = can('data_archive_view_page') && mounted('data_archive')
  const canViewReportTracker = can('f4_f5_view_page') && mounted('report_tracker')
  const canViewEnvironment = mounted('environment_home')
  const canViewOversight =
    mounted('oversight') && user?.organization_type === 'coordinator'
  const canViewAccessInbox =
    mounted('access_inbox') ||
    (user?.organization_type === 'coordinator' && !!user?.organization_id)

  const fSystemChildren: SidebarLinkItem[] = []
  if (canViewF1) {
    fSystemChildren.push({
      href: '/err-portal/f1-work-plans',
      label: t('err:f1_work_plans'),
      icon: <ClipboardList className="h-5 w-5" />,
    })
  }
  if (canViewF2) {
    fSystemChildren.push({
      href: '/err-portal/f2-approvals',
      label: t('err:f2_approvals'),
      icon: <CheckSquare className="h-5 w-5" />,
    })
  }
  if (canViewF3) {
    fSystemChildren.push({
      href: '/err-portal/f3-mous',
      label: 'F3 MOUs',
      icon: <PenTool className="h-5 w-5" />,
    })
  }
  if (canViewF4F5) {
    fSystemChildren.push({
      href: '/err-portal/f4-f5-reporting',
      label: 'F4 & F5 Reporting',
      icon: <BookOpen className="h-5 w-5" />,
    })
  }

  const reportingGroupChildren: SidebarLinkItem[] = []
  if (canViewOversight) {
    reportingGroupChildren.push({
      href: '/err-portal/oversight',
      label: 'Oversight',
      icon: <Eye className="h-5 w-5" />,
    })
  }
  if (canViewReportTracker) {
    reportingGroupChildren.push({
      href: '/err-portal/report-tracker',
      label: 'Report Tracker',
      icon: <BarChart3 className="h-5 w-5" />,
    })
  }
  if (canViewProjectManagement) {
    reportingGroupChildren.push({
      href: '/err-portal/project-management',
      label: t('err:project_management'),
      icon: <Cog className="h-5 w-5" />,
    })
  }
  if (canViewDashboard) {
    reportingGroupChildren.push({
      href: '/err-portal/dashboard',
      label: t('err:dashboard'),
      icon: <BarChart2 className="h-5 w-5" />,
    })
  }
  if (canViewLearnings) {
    reportingGroupChildren.push({
      href: '/err-portal/stories',
      label: 'Mutual Aid Learnings',
      icon: <BookMarked className="h-5 w-5" />,
    })
  }
  if (canViewDataArchive) {
    reportingGroupChildren.push({
      href: '/err-portal/data-archive',
      label: 'Data Archive',
      icon: <Archive className="h-5 w-5" />,
    })
  }

  const grantManagementChildren: SidebarLinkItem[] = []
  if (canViewGrantDecisions) {
    grantManagementChildren.push({
      href: '/err-portal/grant-management/decisions',
      label: 'Decisions',
      icon: <Split className="h-5 w-5" />,
    })
  }
  if (canViewGrantGrants) {
    grantManagementChildren.push({
      href: '/err-portal/grant-management/grants',
      label: 'Grants',
      icon: <PieChart className="h-5 w-5" />,
    })
  }
  if (canViewGrantAllocation) {
    grantManagementChildren.push({
      href: '/err-portal/grant-management/allocation-management',
      label: 'Allocation Management',
      icon: <ArrowLeftRight className="h-5 w-5" />,
    })
  }

  const adminGroupChildren: SidebarLinkItem[] = []
  if (canViewEnvironment) {
    adminGroupChildren.push({
      href: '/err-portal/environment',
      label: 'Environment',
      icon: <Layers className="h-5 w-5" />,
    })
  }
  if (canViewAccessInbox) {
    adminGroupChildren.push({
      href: '/err-portal/access-requests',
      label: user?.organization_type === 'processor' ? 'Access inbox' : 'Access requests',
      icon: <Inbox className="h-5 w-5" />,
    })
  }
  if (canViewRooms) {
    adminGroupChildren.push({
      href: '/err-portal/room-management',
      label: t('err:room_management'),
      icon: <Users className="h-5 w-5" />,
    })
  }
  if (canViewStates) {
    adminGroupChildren.push({
      href: '/err-portal/state-management',
      label: t('err:state_management'),
      icon: <MapPin className="h-5 w-5" />,
    })
  }
  if (canViewUserManagement) {
    adminGroupChildren.push({
      href: '/err-portal/user-management',
      label: t('err:user_management'),
      icon: <UserCog className="h-5 w-5" />,
    })
  }
  if (canViewAuditLogUi(user?.role, user?.status) && mounted('audit_log')) {
    adminGroupChildren.push({
      href: '/err-portal/audit-log',
      label: t('err:audit_log', { defaultValue: 'Audit Log' }),
      icon: <ScrollText className="h-5 w-5" />,
    })
  }
  if (canViewCompliance) {
    adminGroupChildren.push({
      href: '/err-portal/compliance',
      label: compliancePendingCount > 0 ? `Compliance (${compliancePendingCount})` : 'Compliance',
      icon: <ShieldCheck className="h-5 w-5" />,
    })
  }
  if (canRaiseTicket) {
    adminGroupChildren.push({
      href: '/err-portal/raise-a-ticket',
      label: t('err:raise_ticket_title', 'Raise a ticket'),
      icon: <Ticket className="h-5 w-5" />,
    })
  }
  if (canViewTicketDashboard) {
    adminGroupChildren.push({
      href: '/err-portal/ticket-dashboard',
      label: t('err:raise_ticket_dashboard_nav', 'Ticket dashboard'),
      icon: <LayoutDashboard className="h-5 w-5" />,
    })
  }
  if (canViewSurveys) {
    adminGroupChildren.push({
      href: '/err-portal/surveys',
      label: t('err:surveys', 'Surveys'),
      icon: <FileText className="h-5 w-5" />,
    })
  }

  // Wait for permissions AND canvas mounts — otherwise mounts briefly look like full catalog.
  const navLoading = permissionsLoading || canvasLoading

  // While unresolved: minimal non-protected shell only (Home).
  // Do not render permission-/mount-gated nav items (fail closed — no flash).
  const sidebarItems: SidebarItem[] = navLoading
    ? [
        {
          href: '/err-portal',
          label: t('err:home'),
          icon: <Home className="h-5 w-5" />,
        },
      ]
    : [
        {
          href: '/err-portal',
          label: t('err:home'),
          icon: <Home className="h-5 w-5" />,
        },
        ...(grantManagementChildren.length > 0
          ? [
              {
                type: 'group' as const,
                label: t('err:grant_management'),
                children: grantManagementChildren,
              },
            ]
          : []),
        ...(fSystemChildren.length > 0
          ? [
              {
                type: 'group' as const,
                label: 'F-System',
                children: fSystemChildren,
              },
            ]
          : []),
        ...(reportingGroupChildren.length > 0
          ? [
              {
                type: 'group' as const,
                label: 'Reporting & learnings',
                children: reportingGroupChildren,
              },
            ]
          : []),
        ...(adminGroupChildren.length > 0
          ? [
              {
                type: 'group' as const,
                label: 'Admin',
                children: adminGroupChildren,
              },
            ]
          : []),
      ]

  const headerTitle =
    user?.environment_header_title ||
    user?.environment_display_name ||
    'Portal'

  // Localization Hub branded loader only — other orgs/LCC get their own loaders later.
  const lohubPageTransitions =
    !canvasLoading && isLocalizationHubOrg(user?.organization_slug)

  return (
    <PageExplainerProvider>
    <PortalPageTransition enabled={lohubPageTransitions}>
    <MainLayout
        sidebarItems={sidebarItems}
        headerTitle={headerTitle}
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
    </PortalPageTransition>
    </PageExplainerProvider>
  )
}