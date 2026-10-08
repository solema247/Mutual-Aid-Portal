'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, BarChart2, BarChart3, ClipboardList, PieChart, UserCog, CheckSquare, LogOut, BookOpen, BookMarked, PenTool, Cog, MapPin } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { useCanvasSession } from '@/hooks/useCanvasSession'
import { useHomePageExplainer } from './HomePageExplainer'
import { isStateManagementRole } from '@/lib/stateManagement/roles'
import { isModuleMounted, isThinEnvironment } from '@/lib/canvas/mounts'
import '@/i18n/config'

interface User {
  id: string;
  auth_user_id: string;
  display_name: string;
  role: string;
  status: string;
  err_id: string | null;
}

export default function ErrPortalPage() {
  const { t } = useTranslation(['common', 'err'])
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const { mountedModules, isLoading: canvasLoading } = useCanvasSession()
  const mounted = (code: string) => isModuleMounted(mountedModules, code)
  const canViewGrantManagement =
    (can('grant_decisions_view_page') && mounted('grant_decisions')) ||
    (can('grant_grants_view_page') && mounted('grant_grants')) ||
    (can('grant_allocation_view_page') && mounted('grant_allocation'))
  const canViewF1 = can('f1_view_page') && mounted('f1_workplans')
  const canViewF2 = can('f2_view_page') && mounted('f2_approvals')
  const canViewF3 = can('f3_view_page') && mounted('f3_mous')
  const canViewF4F5 = can('f4_f5_view_page') && mounted('f4_f5_reporting')
  const canViewReportTracker = can('f4_f5_view_page') && mounted('report_tracker')
  const canViewProjectManagement = can('management_view_page') && mounted('project_management')
  const canViewUserManagement = can('users_view_page') && mounted('user_management')
  const canViewRooms = can('rooms_view_page') && mounted('room_management')
  const canViewDashboard = can('dashboard_view_page') && mounted('dashboard')
  const canViewLearnings = can('learnings_view_page') && mounted('learnings')
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const canViewStates =
    can('states_view_page') &&
    mounted('state_management') &&
    isStateManagementRole(user?.role)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/users/me')
        
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login'
            return
          }
          throw new Error('Failed to fetch user data')
        }

        const userData = await res.json()

        if (userData.status !== 'active') {
          console.error('User account is not active')
          window.location.href = '/login'
          return
        }

        const modules = (userData.mounted_modules ?? []) as string[]
        if (!userData.canvas_is_fallback && isThinEnvironment(modules)) {
          window.location.href = '/err-portal/environment'
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

  useHomePageExplainer(!isLoading && !permissionsLoading && !canvasLoading)

  if (isLoading || permissionsLoading || canvasLoading) return <div>Loading...</div>

  const handleLogout = async () => {
    try {
      // Clear cookies first (before signOut) to prevent redirect loop
      localStorage.clear()
      document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      
      // Sign out from Supabase (await to ensure it completes)
      await supabase.auth.signOut()
      
      // Small delay to ensure cookies are cleared before redirect
      await new Promise(resolve => setTimeout(resolve, 100))
      
      window.location.href = '/login'
    } catch (error) {
      console.error('Logout error:', error)
      // Even if signOut fails, clear cookies and redirect
      localStorage.clear()
      document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT; SameSite=Lax'
      window.location.href = '/login'
    }
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 mb-12">
        {/* Grant Management */}
        {canViewGrantManagement && (
          <Link href="/err-portal/grant-management" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <PieChart className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:grant_management')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:grant_management_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* F1 Work Plans */}
        {canViewF1 && (
          <Link href="/err-portal/f1-work-plans" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <ClipboardList className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:f1_work_plans')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:f1_work_plans_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* F2 Approvals */}
        {canViewF2 && (
          <Link href="/err-portal/f2-approvals" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <CheckSquare className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:f2_approvals')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:f2_approvals_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* F3 MOUs */}
        {canViewF3 && (
          <Link href="/err-portal/f3-mous" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <PenTool className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:f3_mous')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:f3_mous_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* F4 & F5 Reporting */}
        {canViewF4F5 && (
          <Link href="/err-portal/f4-f5-reporting" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <BookOpen className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:f4_f5_reporting')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:f4_f5_reporting_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* Report Tracker */}
        {canViewReportTracker && (
          <Link href="/err-portal/report-tracker" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <BarChart3 className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:report_tracker')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:report_tracker_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* Project Management */}
        {canViewProjectManagement && (
          <Link href="/err-portal/project-management" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <Cog className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:project_management')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:project_management_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* Dashboard */}
        {canViewDashboard && (
          <Link href="/err-portal/dashboard" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <BarChart2 className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:dashboard')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:dashboard_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* Mutual Aid Learnings */}
        {canViewLearnings && (
          <Link href="/err-portal/stories" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <BookMarked className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:learnings')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:learnings_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* Room Management */}
        {canViewRooms && (
          <Link href="/err-portal/room-management" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <Users className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:room_management')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:room_management_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* State Management */}
        {canViewStates && (
          <Link href="/err-portal/state-management" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <MapPin className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:state_management')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:state_management_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* User Management */}
        {canViewUserManagement && (
          <Link href="/err-portal/user-management" className="block">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
                <UserCog className="h-6 w-6 mb-2" />
                <CardTitle className="text-base">
                  {t('err:user_management')}
                </CardTitle>
                <CardDescription className="mt-1 text-sm">
                  {t('err:user_management_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* Logout Button */}
        <button 
          onClick={handleLogout}
          className="block w-full"
        >
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center p-4">
              <LogOut className="h-6 w-6 mb-2" />
              <CardTitle className="text-base">
                {t('common:logout')}
              </CardTitle>
              <CardDescription className="mt-1 text-sm">
                {t('common:logout_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </button>
      </div>
    </div>
  )
}