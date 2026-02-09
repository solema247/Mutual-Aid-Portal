'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import LanguageSwitch from '@/components/LanguageSwitch'
import { BarChart2, PieChart, LogOut, LayoutDashboard } from 'lucide-react'
import '@/i18n/config'

interface Donor {
  id: string;
  donors: {
    name: string;
  };
}

export default function PartnerPortalPage() {
  const { t } = useTranslation(['common', 'partner'])
  const [isLoading, setIsLoading] = useState(true)
  const [donor, setDonor] = useState<Donor | null>(null)

  useEffect(() => {
    const donorData = localStorage.getItem('donor')
    if (donorData) {
      setDonor(JSON.parse(donorData))
    }
    setIsLoading(false)
  }, [])

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <LanguageSwitch />
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold mb-4">{t('partner:title')}</h1>
        <p className="text-xl mb-8">
          {t('partner:welcome', { name: donor?.donors?.name || t('login:partner') })}
        </p>
      </div>
      
      <nav className="space-y-4">
        <Link href="/dashboard" className="block">
          <Button className="w-full p-4" variant="outline">
            <div className="flex items-center gap-4 w-full">
              <div className="flex items-center gap-2">
                <LayoutDashboard className="h-6 w-6" />
                {t('partner:dashboard')}
              </div>
              <span className="text-sm text-muted-foreground">
                {t('partner:dashboard_desc')}
              </span>
            </div>
          </Button>
        </Link>
        <Link href="/forecast" className="block">
          <Button className="w-full p-4" variant="outline">
            <div className="flex items-center gap-4 w-full">
              <div className="flex items-center gap-2">
                <BarChart2 className="h-6 w-6" />
                {t('partner:forecast')}
              </div>
              <span className="text-sm text-muted-foreground">
                {t('partner:forecast_desc')}
              </span>
            </div>
          </Button>
        </Link>
        <Link href="/partner-portal/grants" className="block">
          <Button className="w-full p-4" variant="outline">
            <div className="flex items-center gap-4 w-full">
              <div className="flex items-center gap-2">
                <PieChart className="h-6 w-6" />
                {t('partner:grants.title')}
              </div>
              <span className="text-sm text-muted-foreground">
                {t('partner:grants.description')}
              </span>
            </div>
          </Button>
        </Link>
      </nav>

      <Button 
        className="w-full justify-start text-left mt-8" 
        variant="outline"
        onClick={async () => {
          try {
            const { supabase } = await import('@/lib/supabaseClient')
            
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
        }}
      >
        <LogOut className="h-5 w-5 mr-2" />
        {t('common:logout')}
      </Button>
    </div>
  )
} 