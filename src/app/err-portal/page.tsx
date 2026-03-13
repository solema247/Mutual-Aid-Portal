'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, BarChart2, BarChart3, ClipboardList, PieChart, UserCog, CheckSquare, LogOut, BookOpen, PenTool, Cog } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
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
  const { can } = useAllowedFunctions()
  const canViewGrantManagement = can('grant_view')
  const canViewF1 = can('f1_view_page')
  const canViewF2 = can('f2_view_page')
  const canViewF3 = can('f3_view_page')
  const canViewF4F5 = can('f4_f5_view_page')
  const canViewProjectManagement = can('management_view_page')
  const canViewUserManagement = can('users_view_page')
  const canViewRooms = can('rooms_view_page')
  const canViewDashboard = can('dashboard_view_page')
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

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
        {canViewF4F5 && (
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