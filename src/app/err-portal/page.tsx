'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Users, BarChart2, FileText, ClipboardList, PieChart, UserCog, CheckSquare, LogOut, BookOpen, PenTool, Cog } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
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
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

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

  // Only show room management for admin and state users
  const canManageRooms = user?.role === 'admin' || user?.role === 'state_err'

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
      localStorage.clear()
      document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
      document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
      window.location.href = '/login'
    } catch (error) {
      console.error('Logout error:', error)
    }
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="text-center mb-12">
        <Image
          src="/logo.jpg"
          alt="LCC Sudan Logo"
          width={200}
          height={233}
          priority
          className="mx-auto mb-6"
        />
        <h1 className="text-4xl font-bold mb-4">{t('err:title')}</h1>
        <p className="text-xl mb-8">
          {t('err:welcome', { name: user?.display_name || t('login:err_staff') })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {/* Grant Management */}
        <Link href="/err-portal/grant-management" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <PieChart className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:grant_management')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:grant_management_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* F1 Work Plans */}
        <Link href="/err-portal/f1-work-plans" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <ClipboardList className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:f1_work_plans')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:f1_work_plans_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* F2 Approvals */}
        <Link href="/err-portal/f2-approvals" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <CheckSquare className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:f2_approvals')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:f2_approvals_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* F3 MOUs */}
        <Link href="/err-portal/f3-mous" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <PenTool className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:f3_mous')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:f3_mous_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* F4 & F5 Reporting */}
        <Link href="/err-portal/f4-f5-reporting" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <BookOpen className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:f4_f5_reporting')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:f4_f5_reporting_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Project Management */}
        <Link href="/err-portal/project-management" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <Cog className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:project_management')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:project_management_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Dashboard */}
        <Link href="/err-portal/dashboard" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <BarChart2 className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:dashboard')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:dashboard_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Room Management - Conditional */}
        {canManageRooms && (
          <Link href="/err-portal/room-management" className="block aspect-square">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center">
                <Users className="h-8 w-8 mb-4" />
                <CardTitle className="text-xl">
                  {t('err:room_management')}
                </CardTitle>
                <CardDescription className="mt-2">
                  {t('err:room_management_desc')}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        )}

        {/* User Management */}
        <Link href="/err-portal/user-management" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <UserCog className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('err:user_management')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:user_management_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        {/* Logout Button */}
        <button 
          onClick={handleLogout}
          className="block aspect-square"
        >
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <LogOut className="h-8 w-8 mb-4" />
              <CardTitle className="text-xl">
                {t('common:logout')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('common:logout_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </button>
      </div>
    </div>
  )
}