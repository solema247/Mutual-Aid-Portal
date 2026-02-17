'use client'

import { ForecastStatusByMonthChart } from './ForecastStatusByMonthChart'
import { ForecastSankeyChart } from './ForecastSankeyChart'
import { ForecastStateSupportChart } from './ForecastStateSupportChart'
import { ForecastSourceOverTimeChart } from './ForecastSourceOverTimeChart'
import { ForecastReceivingMagOverTimeChart } from './ForecastReceivingMagOverTimeChart'
import { ForecastDownloadModal } from './ForecastDownloadModal'

export function ViewForecasts() {
  return (
    <div className="space-y-4">
      <div className="space-y-4 pt-4">
        <div className="flex justify-end">
          <ForecastDownloadModal />
        </div>
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
  )
} 