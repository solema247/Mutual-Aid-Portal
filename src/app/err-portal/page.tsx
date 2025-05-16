'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import '@/i18n/config'

interface User {
  role: string;
  name: string;
}

export default function ErrPortalPage() {
  const { t } = useTranslation(['common', 'err'])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    setIsLoading(false)
  }, [])

  if (isLoading) return <div>Loading...</div>

  // Only show room management for admin users
  const isAdmin = user?.role === 'admin'

  const handleLogout = () => {
    localStorage.clear()
    document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
    window.location.href = '/login'
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
          {t('err:welcome', { name: user?.name || t('login:err_staff') })}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {isAdmin && (
          <Link href="/err-portal/room-management" className="block aspect-square">
            <Card className="h-full hover:bg-muted/50 transition-colors">
              <CardHeader className="h-full flex flex-col justify-center items-center text-center">
                <span className="text-4xl mb-4">🏥</span>
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
        
        <Link href="/err-portal/project-management" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <span className="text-4xl mb-4">📋</span>
              <CardTitle className="text-xl">
                {t('err:project_management')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:project_management_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <Link href="/err-portal/dashboard" className="block aspect-square">
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <span className="text-4xl mb-4">📈</span>
              <CardTitle className="text-xl">
                {t('err:dashboard')}
              </CardTitle>
              <CardDescription className="mt-2">
                {t('err:dashboard_desc')}
              </CardDescription>
            </CardHeader>
          </Card>
        </Link>

        <button 
          onClick={handleLogout}
          className="block aspect-square"
        >
          <Card className="h-full hover:bg-muted/50 transition-colors">
            <CardHeader className="h-full flex flex-col justify-center items-center text-center">
              <span className="text-4xl mb-4">🚪</span>
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