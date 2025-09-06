'use client'

import { useTranslation } from 'react-i18next'
import { CollapsibleRow } from '@/components/ui/collapsible'

export default function DashboardPage() {
  const { t } = useTranslation(['dashboard', 'err'])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">
          {t('err:dashboard')}
        </h1>
      </div>

      <div className="space-y-4">
        <CollapsibleRow
          title={t('dashboard:overview_title')}
          variant="primary"
          defaultOpen={true}
        >
          <div className="p-4">
            <iframe 
              width="100%" 
              height="443" 
              src="https://lookerstudio.google.com/embed/reporting/128061d9-8499-414d-ac14-1c04068a2d4d/page/cPRTF" 
              frameBorder="0" 
              style={{border: 0}} 
              allowFullScreen 
              sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            />
          </div>
        </CollapsibleRow>

        <CollapsibleRow
          title={t('dashboard:statistics_title')}
          defaultOpen={false}
        >
          <div className="p-4 text-muted-foreground">
            {t('dashboard:coming_soon')}
          </div>
        </CollapsibleRow>

        <CollapsibleRow
          title={t('dashboard:reports_title')}
          defaultOpen={false}
        >
          <div className="p-4 text-muted-foreground">
            {t('dashboard:coming_soon')}
          </div>
        </CollapsibleRow>
      </div>
    </div>
  )
} 