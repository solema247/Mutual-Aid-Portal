'use client'

import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

import { CycleManager } from './components'

export default function GrantManagementPage() {
  const { t } = useTranslation(['err', 'common'])
  const router = useRouter()

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button 
            variant="outline" 
            onClick={() => router.push('/err-portal')}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('common:back')}
          </Button>
          <h2 className="text-2xl font-semibold">{t('err:grant_management')}</h2>
        </div>
      </div>

      {/* Cycle Management System */}
      <CycleManager />
    </div>
  )
}