'use client'

import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { ForecastStatusByMonthChart } from './ForecastStatusByMonthChart'
import { ForecastSankeyChart } from './ForecastSankeyChart'
import { ForecastStateSupportChart } from './ForecastStateSupportChart'

export function ViewForecasts() {
  const { t } = useTranslation(['forecast', 'common'])
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="space-y-4">
      <div className="space-y-4 pt-4">
        <ForecastStatusByMonthChart />
        <div className="flex gap-4 items-stretch">
          <div className="w-1/2 min-w-0 flex flex-col">
            <ForecastSankeyChart />
          </div>
          <div className="w-1/2 min-w-0 flex flex-col">
            <ForecastStateSupportChart />
          </div>
        </div>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
              <p className="mt-2 text-sm text-gray-600">{t('common:loading')}</p>
            </div>
          </div>
        )}
        <div className="w-full aspect-[4/3] rounded-lg overflow-hidden border border-gray-200 relative">
          <iframe
            src="https://lookerstudio.google.com/embed/reporting/0dfbd523-dcc9-46bd-a555-ec2cc8743fe2/page/p_flxlejmlrd?embedded=true&hideBottomBar=true"
            width="100%"
            height="100%"
            style={{ border: 0 }}
            frameBorder="0"
            allowFullScreen
            sandbox="allow-storage-access-by-user-activation allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </div>
    </div>
  )
} 