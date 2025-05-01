'use client'

import { useTranslation } from 'react-i18next'
import { Construction } from 'lucide-react'

export function ViewForecasts() {
  const { t } = useTranslation(['forecast', 'common'])

  return (
    <div className="space-y-4">
      <div className="space-y-4 pt-4">
        <div className="bg-yellow-100 border border-yellow-200 text-black px-4 py-3 rounded-md text-center">
          {t('forecast:sections.view.description')}
        </div>

        <div className="bg-blue-100 border border-blue-200 text-black px-4 py-3 rounded-md text-center flex items-center justify-center gap-2">
          <Construction className="h-5 w-5" />
          Dashboard in Development
        </div>
      </div>
    </div>
  )
} 