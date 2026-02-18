'use client'

import { useTranslation } from 'react-i18next'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ForecastStatusByMonthChart } from './ForecastStatusByMonthChart'
import { ForecastSankeyChart } from './ForecastSankeyChart'
import { ForecastStateSupportChart } from './ForecastStateSupportChart'
import { ForecastSourceOverTimeChart } from './ForecastSourceOverTimeChart'
import { ForecastReceivingMagOverTimeChart } from './ForecastReceivingMagOverTimeChart'
import { ForecastDownloadModal } from './ForecastDownloadModal'
import { ForecastChartsRefreshProvider, useForecastChartsRefresh } from './ForecastChartsRefreshContext'

function ViewForecastsActions() {
  const { t } = useTranslation(['forecast', 'common'])
  const { refresh } = useForecastChartsRefresh()
  return (
    <div className="flex justify-end gap-2">
      <Button variant="outline" size="sm" className="gap-2" onClick={refresh}>
        <RefreshCw className="size-4" />
        {t('forecast:refresh_charts', 'Refresh charts')}
      </Button>
      <ForecastDownloadModal />
    </div>
  )
}

export function ViewForecasts() {
  return (
    <ForecastChartsRefreshProvider>
      <div className="space-y-4">
        <div className="space-y-4 pt-4">
          <ViewForecastsActions />
        <div data-download-chart="status-by-month">
          <ForecastStatusByMonthChart />
        </div>
        <div className="flex gap-4 items-stretch">
          <div className="w-1/2 min-w-0 flex flex-col" data-download-chart="sankey">
            <ForecastSankeyChart />
          </div>
          <div className="w-1/2 min-w-0 flex flex-col" data-download-chart="state-support">
            <ForecastStateSupportChart />
          </div>
        </div>
        <div className="flex gap-4">
          <div className="w-1/2 min-w-0" data-download-chart="source-by-month">
            <ForecastSourceOverTimeChart />
          </div>
          <div className="w-1/2 min-w-0" data-download-chart="receiving-mag">
            <ForecastReceivingMagOverTimeChart />
          </div>
        </div>
      </div>
    </div>
    </ForecastChartsRefreshProvider>
  )
} 