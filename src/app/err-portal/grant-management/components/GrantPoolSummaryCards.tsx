'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'

type PoolSummary = {
  total_included: number
  total_committed: number
  total_pending: number
  total_grants: number
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

  const remaining =
    summary != null
      ? summary.total_grants - summary.total_committed - summary.total_pending
      : null

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.total_funds_allocated')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {t('err:gm.total_funds_allocated_desc')}
          </div>
        </CardHeader>
        <CardContent className="pt-0 mt-auto">
          <div className="text-2xl font-bold">{summary ? money(summary.total_included) : '—'}</div>
        </CardContent>
      </Card>
      <Card className="flex flex-col h-full">
        <CardHeader className="flex-shrink-0 space-y-1.5 pb-2">
          <CardTitle className="text-sm leading-tight">{t('err:gm.total_funds_transferred')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">
            {t('err:gm.total_funds_transferred_desc')}
          </div>
        </CardHeader>
        <CardContent className="pt-0 mt-auto">
          <div className="text-2xl font-bold">{summary ? money(summary.total_grants) : '—'}</div>
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
          <CardTitle className="text-sm leading-tight">{t('err:gm.remaining')}</CardTitle>
          <div className="text-xs text-muted-foreground line-clamp-2">{t('err:gm.remaining_desc')}</div>
        </CardHeader>
        <CardContent
          className={`pt-0 mt-auto text-2xl font-bold ${
            remaining != null && remaining >= 0 ? 'text-green-700' : 'text-red-700'
          }`}
        >
          {remaining != null ? money(remaining) : '—'}
        </CardContent>
      </Card>
    </div>
  )
}
