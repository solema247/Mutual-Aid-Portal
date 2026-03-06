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

type F1ByStateRow = {
  state: string
  state_name_ar: string | null
  count: number
  portal_count: number
  historical_count: number
}

export function F1ByStateWidget() {
  const { t } = useTranslation(['dashboard', 'common'])
  const [rows, setRows] = useState<F1ByStateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard/f1-by-state')
        const json = await res.json()
        if (!res.ok) throw new Error((json?.error as string) || 'Failed to load F1 by state')
        if (!cancelled) setRows(Array.isArray(json) ? json : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  const total = rows.reduce((s, r) => s + r.count, 0)
  const totalPortal = rows.reduce((s, r) => s + (r.portal_count ?? 0), 0)
  const totalHistorical = rows.reduce((s, r) => s + (r.historical_count ?? 0), 0)

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard:f1_by_state_title', 'F1 uploads by state')}</CardTitle>
          <CardDescription>{t('dashboard:f1_by_state_description', 'F1 work plans by Sudan state (portal uploads and historical import)')}</CardDescription>
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
          <CardTitle>{t('dashboard:f1_by_state_title', 'F1 uploads by state')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-destructive text-sm">{error}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('dashboard:f1_by_state_title', 'F1 uploads by state')}</CardTitle>
        <CardDescription>{t('dashboard:f1_by_state_description', 'F1 work plans by Sudan state (portal uploads and historical import)')}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 font-medium">{t('dashboard:state', 'State')}</th>
                <th className="text-right py-2 font-medium">{t('dashboard:f1_count', 'F1 count')}</th>
                <th className="text-right py-2 font-medium text-muted-foreground">{t('dashboard:portal', 'Portal')}</th>
                <th className="text-right py-2 font-medium text-muted-foreground">{t('dashboard:historical', 'Historical')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.state} className="border-b last:border-0">
                  <td className="py-1.5">{r.state_name_ar ? `${r.state} / ${r.state_name_ar}` : r.state}</td>
                  <td className="text-right py-1.5 font-medium">{r.count}</td>
                  <td className="text-right py-1.5 text-muted-foreground">{r.portal_count ?? 0}</td>
                  <td className="text-right py-1.5 text-muted-foreground">{r.historical_count ?? 0}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t font-medium">
                <td className="py-2">{t('dashboard:total', 'Total')}</td>
                <td className="text-right py-2">{total}</td>
                <td className="text-right py-2 text-muted-foreground">{totalPortal ?? 0}</td>
                <td className="text-right py-2 text-muted-foreground">{totalHistorical ?? 0}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
