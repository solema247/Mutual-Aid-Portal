'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import ProjectManagement from './components/ProjectManagement'

export default function ProjectManagementPage() {
  const { t } = useTranslation(['projects', 'err'])
  const router = useRouter()
  const { can } = useAllowedFunctions()
  const canViewPage = can('management_view_page')

  useEffect(() => {
    if (!canViewPage) {
      router.replace('/err-portal')
    }
  }, [canViewPage, router])

  if (!canViewPage) return null

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {t('err:project_management')}
        </h1>
      </div>
      <ProjectManagement />
    </div>
  )
} 