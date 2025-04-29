'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'

export function ViewForecasts() {
  const { t } = useTranslation(['forecast', 'common'])
  const [isLoading, setIsLoading] = useState(true)
  const iframeKey = Math.random() // Force iframe to reset on re-render

  return (
    <div className="space-y-4">
      <div className="space-y-4 pt-4 relative">
        <div className="bg-yellow-100 border border-yellow-200 text-black px-4 py-3 rounded-md text-center">
          {t('forecast:sections.view.description')}
        </div>

        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/80">
            {t('common:loading')}
          </div>
        )}
        <iframe
          key={iframeKey}
          src="https://lookerstudio.google.com/embed/reporting/d638c09b-13b6-46c5-83de-c929043f79d7/page/BR1FF?embedded=true&rm=minimal"
          frameBorder="0"
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          style={{
            width: '100%',
            height: '1200px',
            border: 0,
            minHeight: '800px'
          }}
          allowFullScreen
          onLoad={() => setIsLoading(false)}
        />
      </div>
    </div>
  )
} 