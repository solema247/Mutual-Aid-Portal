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
          title={t('dashboard:reports_title')}
          defaultOpen={true}
        >
          <div className="p-4 overflow-auto">
            <div style={{ transform: 'scale(0.6)', transformOrigin: 'top left', width: '166.67%', height: '1400px' }}>
              <iframe
                src="https://lookerstudio.google.com/embed/reporting/dd8151a5-bba2-45fb-8441-8dc0805bd7f2/page/p_r0tcdcayzd"
                width="100%"
                height="1400"
                style={{ border: 0 }}
                allowFullScreen
                sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                title="Sudan ERR Reports"
              />
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
  )
} 