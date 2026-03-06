'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

type ApiResponse = {
  total_with_ocr: number
  accepted_count: number
  accuracy_percent: number
  by_state?: { state: string; total: number; accepted: number; percent: number }[]
}

export function OcrAcceptanceCard() {
  const { t } = useTranslation(['dashboard', 'common'])
  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard/f1-ocr-accuracy')
        if (!res.ok) throw new Error('Failed to load OCR accuracy')
        const json: ApiResponse = await res.json()
        if (!cancelled) setData(json)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:ocr_acceptance_title', 'F1 OCR acceptance')}</CardTitle>
          <CardDescription>{t('dashboard:ocr_acceptance_description', 'Share of F1 uploads accepted with no or minimal edits after OCR')}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">{t('common:loading', 'Loading...')}</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:ocr_acceptance_title', 'F1 OCR acceptance')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    )
  }

  const { total_with_ocr, accepted_count, accuracy_percent, by_state } = data!

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard:ocr_acceptance_title', 'F1 OCR acceptance')}</CardTitle>
        <CardDescription>{t('dashboard:ocr_acceptance_description', 'Share of F1 uploads accepted with no or minimal edits after OCR')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <p className="text-2xl font-semibold">{accuracy_percent}%</p>
          <p className="text-muted-foreground text-sm">
            {accepted_count} / {total_with_ocr} F1 uploads with OCR accepted with minimal or no edits
          </p>
          {by_state && by_state.length > 0 && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-1 font-medium">{t('dashboard:state', 'State')}</th>
                    <th className="text-right py-1 font-medium">%</th>
                    <th className="text-right py-1 font-medium">{t('dashboard:f1_count', 'F1 count')}</th>
                  </tr>
                </thead>
                <tbody>
                  {by_state.map((r) => (
                    <tr key={r.state} className="border-b last:border-0">
                      <td className="py-1">{r.state}</td>
                      <td className="text-right py-1">{r.percent}%</td>
                      <td className="text-right py-1">{r.accepted}/{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
