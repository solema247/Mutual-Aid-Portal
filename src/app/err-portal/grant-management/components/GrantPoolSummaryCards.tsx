'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'

type PoolSummary = {
  total_allocated: number
  total_assigned: number
  total_available: number
  total_committed: number
  total_pending: number
  total_balance: number
}

function money(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n)
}

export default function GrantPoolSummaryCards() {
  const { t } = useTranslation(['err'])
  const [summary, setSummary] = useState<PoolSummary | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/pool/summary', { cache: 'no-store' })
      .then((r) => r.json())
      .then((pool) => {
        if (!cancelled) setSummary(pool)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-2">
        <div className="lg:col-span-3 text-center py-2 bg-slate-50 rounded-none border">
          <div className="text-xs font-semibold">Allocation Pool Overview</div>
          <div className="text-[10px] text-muted-foreground">Distribution allocations and current usage</div>
        </div>
        <div className="lg:col-span-3 text-center py-2 bg-slate-50 rounded-none border">
          <div className="text-xs font-semibold">Pipeline</div>
          <div className="text-[10px] text-muted-foreground">Projects in approval and assignment workflow</div>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.total_allocated')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {t('err:gm.total_allocated_desc')}
          </div>
        </CardHeader>
        <CardContent className="pt-0 mt-auto">
          <div className="text-2xl font-bold">{summary ? money(summary.total_allocated) : '—'}</div>
        </CardContent>
      </Card>
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.assigned')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {t('err:gm.assigned_desc')}
          </div>
        </CardHeader>
        <CardContent className="pt-0 mt-auto">
          <div className="text-2xl font-bold">{summary ? money(summary.total_assigned) : '—'}</div>
        </CardContent>
      </Card>
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.available')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {t('err:gm.available_desc')}
          </div>
        </CardHeader>
        <CardContent
          className={`pt-0 mt-auto text-2xl font-bold ${
            summary && summary.total_available >= 0 ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {summary ? money(summary.total_available) : '—'}
        </CardContent>
      </Card>
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.committed')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.committed_desc')}</div>
        </CardHeader>
        <CardContent className="pt-0 mt-auto text-2xl font-bold">
          {summary ? money(summary.total_committed) : '—'}
        </CardContent>
      </Card>
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.pending')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.pending_desc')}</div>
        </CardHeader>
        <CardContent className="pt-0 mt-auto text-2xl font-bold">
          {summary ? money(summary.total_pending) : '—'}
        </CardContent>
      </Card>
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.balance')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.balance_desc')}</div>
        </CardHeader>
        <CardContent
          className={`pt-0 mt-auto text-2xl font-bold ${
            summary && summary.total_balance >= 0 ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {summary ? money(summary.total_balance) : '—'}
        </CardContent>
      </Card>
      </div>
    </div>
  )
}
