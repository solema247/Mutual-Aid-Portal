'use client'

import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CollapsibleRow } from '@/components/ui/collapsible'
import { GrantsStackedBarChart } from './GrantsStackedBarChart'
import { ProjectsByDonorChart } from './ProjectsByDonorChart'

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'err', 'common'])

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
            <Link href="/partner-portal" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              {t('common:back_to_home')}
            </Link>
          </Button>
        </div>
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">
            {t('err:dashboard')}
          </h1>
        </div>

        <div className="space-y-4">
        <CollapsibleRow
          title="Looker Studio Dashboard"
          defaultOpen={true}
        >
          <div className="p-4 overflow-hidden" style={{ height: '1040px' }}>
            <div style={{ transform: 'scale(0.65)', transformOrigin: 'top left', width: '153.85%', height: '1600px' }}>
              <iframe
                src="https://lookerstudio.google.com/embed/reporting/dd8151a5-bba2-45fb-8441-8dc0805bd7f2/page/p_r0tcdcayzd"
                width="100%"
                height="1600"
                style={{ border: 0 }}
                allowFullScreen
                sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                title="Sudan ERR Reports"
              />
            </div>
          </div>
        </CollapsibleRow>

        <CollapsibleRow
          title="Dashboard (Work-in-progress)"
          defaultOpen={true}
        >
          <div className="p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ProjectsByDonorChart />
              <GrantsStackedBarChart />
            </div>
          </div>
        </CollapsibleRow>

        <CollapsibleRow
          title={t('dashboard:map_title')}
          defaultOpen={false}
        >
          <div className="p-4">
            <iframe
              src="https://felt.com/embed/map/SudanERRQGIS-z2CDxQ3DRnCUTluniOvKIA"
              width="100%"
              height="600"
              style={{ border: "none" }}
              allowFullScreen
              loading="lazy"
              title="Sudan ERR Map"
            />
          </div>
        </CollapsibleRow>
        </div>
      </div>
    </div>
  )
} 