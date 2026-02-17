'use client'

import { useTranslation } from 'react-i18next'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import { BarChart2, LayoutDashboard } from 'lucide-react'
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
        <Link href="/partner-portal/dashboard" className="block">
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
        <Link href="/partner-portal/forecast" className="block">
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
      </nav>
    </div>
  )
} 