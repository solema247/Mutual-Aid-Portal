'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import LanguageSwitch from '@/components/LanguageSwitch'
import { useTranslation } from 'react-i18next'
import '@/i18n/config'

export default function Home() {
  const { t } = useTranslation(['common'])
  const [isLoading, setIsLoading] = useState(true)
  const [userType, setUserType] = useState<'donor' | 'err' | null>(null)
  const [userName, setUserName] = useState<string | null>(null)

  useEffect(() => {
    // Check for recovery hash fragments first (before any other checks)
    const hash = window.location.hash
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1))
      const type = hashParams.get('type')
      const accessToken = hashParams.get('access_token')
      
      // If it's a recovery type, redirect to login with hash preserved
      if (type === 'recovery' && accessToken) {
        window.location.href = '/login' + hash
        return
      }
    }
    
    // Wrap in setTimeout to allow initial render
    setTimeout(() => {
      const isAuthenticated = localStorage.getItem('isAuthenticated')
      if (!isAuthenticated) {
        window.location.href = '/login'
        return
      }

      // Determine user type and get user name
      const donor = localStorage.getItem('donor')
      const user = localStorage.getItem('user')
      
      if (donor) {
        setUserType('donor')
        const donorData = JSON.parse(donor)
        setUserName(donorData?.donors?.name || 'User')
      }
      if (user) {
        setUserType('err')
        const userData = JSON.parse(user)
        setUserName(userData?.full_name || 'User')
      }
      
      setIsLoading(false)
    }, 100)
  }, [])

  const handleLogout = async () => {
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
  }

  if (isLoading) {
    return <div>Loading...</div>
  }

  return (
    <div className="min-h-screen bg-white">
      {/* Navbar */}
      <nav className="border-b border-gray-200 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {t('common:welcome') || 'Welcome'}, {userName}
          </h1>
          <div className="flex items-center gap-4">
            <LanguageSwitch />
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto p-6">
        <nav className="space-y-4">
          {userType === 'donor' && (
            <Link href="/forecast">
              <Button className="w-full justify-start text-left" variant="outline">
                📊 Forecasting Tool
              </Button>
            </Link>
          )}
          {userType === 'err' && (
            <Link href="/dashboard">
              <Button className="w-full justify-start text-left" variant="outline">
                📈 Dashboard
              </Button>
            </Link>
          )}
          <Button 
            className="w-full justify-start text-left mt-8" 
            variant="outline"
            onClick={handleLogout}
          >
            🚪 Logout
          </Button>
        </nav>
      </div>
    </div>
  )
}
