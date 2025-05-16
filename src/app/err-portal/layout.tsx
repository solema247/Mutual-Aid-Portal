'use client'

import { useTranslation } from 'react-i18next'
import MainLayout from '@/components/layout/MainLayout'
import { Users } from 'lucide-react'

export default function ErrPortalLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { t } = useTranslation(['err'])

  const sidebarItems = [
    {
      href: '/err-portal',
      label: t('err:home'),
      icon: '🏠'
    },
    {
      href: '/err-portal/room-management',
      label: t('err:room_management'),
      icon: '🤝'
    },
    {
      href: '/err-portal/user-management',
      label: t('err:user_management'),
      icon: <Users className="h-5 w-5" />
    },
    {
      href: '/err-portal/project-management',
      label: t('err:project_management'),
      icon: '📋'
    },
    {
      href: '/err-portal/dashboard',
      label: t('err:dashboard'),
      icon: '📈'
    }
  ]

  return <MainLayout sidebarItems={sidebarItems}>{children}</MainLayout>
} 