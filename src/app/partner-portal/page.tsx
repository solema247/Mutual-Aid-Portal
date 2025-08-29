'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import LanguageSwitch from '@/components/LanguageSwitch'
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
        <Image
          src="/logo.jpg"
          alt="LCC Sudan Logo"
          width={200}
          height={233}
          priority
          className="mx-auto mb-6"
        />
        <h1 className="text-4xl font-bold mb-4">{t('partner:title')}</h1>
        <p className="text-xl mb-8">
          {t('partner:welcome', { name: donor?.donors?.name || t('login:partner') })}
        </p>
      </div>
      
      <nav className="space-y-4">
        <Link href="/forecast" className="block">
          <Button className="w-full p-4" variant="outline">
            <div className="flex items-center gap-4 w-full">
              <div className="flex items-center gap-2">
                📊 {t('partner:forecast')}
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
                💰 {t('partner:grants.title')}
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