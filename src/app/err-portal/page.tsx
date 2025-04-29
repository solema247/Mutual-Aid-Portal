'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import LanguageSwitch from '@/components/LanguageSwitch'
import '@/i18n/config'  // Update to use absolute path

export default function ErrPortalPage() {
  const { t } = useTranslation(['common', 'err'])
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
    setIsLoading(false)
  }, [])

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="max-w-4xl mx-auto p-6">
      <LanguageSwitch />
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
      
      <nav className="space-y-4">
        <Link href="/dashboard" className="block">
          <Button className="w-full p-4" variant="outline">
            <div className="flex items-center gap-4 w-full">
              <div className="flex items-center gap-2">
                📈 {t('err:dashboard')}
              </div>
              <span className="text-sm text-muted-foreground">
                {t('err:dashboard_desc')}
              </span>
            </div>
          </Button>
        </Link>
        {/* Add more tools/features as needed */}
      </nav>

      <Button 
        className="w-full justify-start text-left mt-8" 
        variant="outline"
        onClick={() => {
          localStorage.clear()
          document.cookie = 'isAuthenticated=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
          document.cookie = 'userType=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT'
          window.location.href = '/login'
        }}
      >
        🚪 {t('common:logout')}
      </Button>
    </div>
  )
} 