'use client'

import { useTranslation } from 'react-i18next'
import MainLayout from '@/components/layout/MainLayout'
import { Home, LayoutDashboard, BarChart2 } from 'lucide-react'

export default function PartnerPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation(['partner'])

  const sidebarItems = [
    {
      href: '/partner-portal',
      label: t('partner:home'),
      icon: <Home className="h-5 w-5" />
    },
    {
      href: '/partner-portal/dashboard',
      label: t('partner:dashboard'),
      icon: <LayoutDashboard className="h-5 w-5" />
    },
    {
      href: '/partner-portal/forecast',
      label: t('partner:forecast'),
      icon: <BarChart2 className="h-5 w-5" />
    }
  ]

  return (
    <MainLayout sidebarItems={sidebarItems} sidebarTitle={t('partner:navigation')}>
      {children}
    </MainLayout>
  )
}
