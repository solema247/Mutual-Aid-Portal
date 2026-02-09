'use client'

import { useTranslation } from 'react-i18next'
import ProjectManagement from './components/ProjectManagement'

export default function ProjectManagementPage() {
  const { t } = useTranslation(['projects', 'err'])

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