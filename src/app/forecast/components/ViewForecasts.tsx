'use client'

import { useState } from 'react'
import { CollapsibleRow } from '@/components/ui/collapsible'

export function ViewForecasts() {
  const [isLoading, setIsLoading] = useState(true)

  return (
    <div className="space-y-4">
      <CollapsibleRow title="View Forecasts" variant="primary">
        <div className="space-y-4 pt-4 relative">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80">
              Loading visualizations...
            </div>
          )}
          <iframe
            src="https://lookerstudio.google.com/embed/reporting/d638c09b-13b6-46c5-83de-c929043f79d7/page/BR1FF"
            frameBorder="0"
            style={{
              width: '100%',
              height: '600px', // You can adjust this height
              border: 0
            }}
            allowFullScreen
            onLoad={() => setIsLoading(false)}
          />
        </div>
      </CollapsibleRow>
    </div>
  )
} 