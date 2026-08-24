'use client'

import { useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'

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

function SummaryStatCard({
  title,
  description,
  value,
  valueClassName,
}: {
  title: string
  description: string
  value: string
  valueClassName?: string
}) {
  return (
    <Card className="flex h-full min-w-0 flex-col gap-3 overflow-hidden py-4">
      <CardHeader className="flex-shrink-0 space-y-1.5 px-4 pb-0">
        <CardTitle className="text-sm leading-tight">{title}</CardTitle>
        <div className="text-xs text-muted-foreground line-clamp-2">{description}</div>
      </CardHeader>
      <CardContent className="min-w-0 px-4 pt-0 mt-auto">
        <div
          title={value}
          className={cn(
            'font-bold tabular-nums tracking-tight leading-none whitespace-nowrap overflow-hidden text-ellipsis',
            'text-[clamp(0.85rem,0.9vw+0.4rem,1.1rem)]',
            valueClassName
          )}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  )
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-2">
        <div className="sm:col-span-2 lg:col-span-3 text-center py-2 bg-slate-50 rounded-none border">
          <div className="text-xs font-semibold">Allocation Pool Overview</div>
          <div className="text-[10px] text-muted-foreground">Distribution allocations and current usage</div>
        </div>
        <div className="sm:col-span-2 lg:col-span-3 text-center py-2 bg-slate-50 rounded-none border">
          <div className="text-xs font-semibold">Pipeline</div>
          <div className="text-[10px] text-muted-foreground">Projects in approval and assignment workflow</div>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <SummaryStatCard
          title={t('err:gm.total_allocated')}
          description={t('err:gm.total_allocated_desc')}
          value={summary ? money(summary.total_allocated) : '—'}
        />
        <SummaryStatCard
          title={t('err:gm.assigned')}
          description={t('err:gm.assigned_desc')}
          value={summary ? money(summary.total_assigned) : '—'}
        />
        <SummaryStatCard
          title={t('err:gm.available')}
          description={t('err:gm.available_desc')}
          value={summary ? money(summary.total_available) : '—'}
          valueClassName={summary && summary.total_available >= 0 ? 'text-green-700' : 'text-red-700'}
        />
        <SummaryStatCard
          title={t('err:gm.committed')}
          description={t('err:gm.committed_desc')}
          value={summary ? money(summary.total_committed) : '—'}
        />
        <SummaryStatCard
          title={t('err:gm.pending')}
          description={t('err:gm.pending_desc')}
          value={summary ? money(summary.total_pending) : '—'}
        />
        <SummaryStatCard
          title={t('err:gm.balance')}
          description={t('err:gm.balance_desc')}
          value={summary ? money(summary.total_balance) : '—'}
          valueClassName={summary && summary.total_balance >= 0 ? 'text-green-700' : 'text-red-700'}
        />
      </div>
    </div>
  )
}
