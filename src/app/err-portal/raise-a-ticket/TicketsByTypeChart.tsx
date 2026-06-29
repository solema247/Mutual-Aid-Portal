'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { type ChartConfig } from '@/components/ui/chart'
import {
  DEFAULT_TICKET_STATUS_FILTER,
  GITHUB_PROJECT_BIG_ROCK_CHART_ORDER,
  RAISE_TICKET_BIG_ROCK_I18N_KEYS,
  bigRockChartColor,
  type TicketStatusFilter,
  type TicketsByBigRockChartRow,
} from '@/lib/raiseTicketGithub'

type ApiResponse = {
  chartData: TicketsByBigRockChartRow[]
  total: number
  statusFilter?: TicketStatusFilter
}

interface TicketsByTypeChartProps {
  enabled?: boolean
}

function CompactChartCard ({
  title,
  description,
  headerExtra,
  children,
}: {
  title: string
  description: string
  headerExtra?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-1.5 p-4 pb-2">
        <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
        <CardDescription className="text-xs leading-snug">{description}</CardDescription>
        {headerExtra}
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  )
}

export function TicketsByTypeChart ({ enabled = true }: TicketsByTypeChartProps) {
  const { t } = useTranslation('err')
  const [statusFilter, setStatusFilter] = useState<TicketStatusFilter>(DEFAULT_TICKET_STATUS_FILTER)
  const [chartData, setChartData] = useState<TicketsByBigRockChartRow[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {
      count: { label: t('raise_ticket_chart_count_label', 'Tickets') },
    }
    GITHUB_PROJECT_BIG_ROCK_CHART_ORDER.forEach((bigRock, index) => {
      config[bigRock] = {
        label: t(RAISE_TICKET_BIG_ROCK_I18N_KEYS[bigRock], bigRock),
        color: bigRockChartColor(index),
      }
    })
    return config
  }, [t])

  const maxCount = useMemo(
    () => Math.max(1, ...chartData.map((row) => row.count)),
    [chartData]
  )

  const title = t('raise_ticket_chart_big_rock_title', 'By Big Rock')
  const description = t(
    statusFilter === 'open'
      ? 'raise_ticket_chart_type_desc_open'
      : 'raise_ticket_chart_type_desc_closed',
    statusFilter === 'open'
      ? '{{count}} open on board'
      : '{{count}} done on board',
    { count: total }
  )

  const statusFilterControl = (
    <div className="flex gap-1.5 pt-1" role="group" aria-label={t('raise_ticket_chart_status_filter', 'Status filter')}>
      <Button
        type="button"
        size="sm"
        variant={statusFilter === 'open' ? 'default' : 'outline'}
        className="h-7 px-2.5 text-xs"
        onClick={() => setStatusFilter('open')}
      >
        {t('raise_ticket_chart_filter_open', 'Open')}
      </Button>
      <Button
        type="button"
        size="sm"
        variant={statusFilter === 'closed' ? 'default' : 'outline'}
        className="h-7 px-2.5 text-xs"
        onClick={() => setStatusFilter('closed')}
      >
        {t('raise_ticket_chart_filter_closed', 'Closed')}
      </Button>
    </div>
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function fetchData () {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/support/github-tickets/by-type?status=${encodeURIComponent(statusFilter)}`
        )
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const msg =
            body &&
            typeof body === 'object' &&
            'detail' in body &&
            typeof (body as { detail?: string }).detail === 'string'
              ? (body as { detail: string }).detail
              : body &&
                typeof body === 'object' &&
                'error' in body &&
                typeof (body as { error?: string }).error === 'string'
                ? (body as { error: string }).error
                : 'Failed to load ticket stats'
          throw new Error(msg)
        }
        const json = (await res.json()) as ApiResponse
        if (!cancelled) {
          setChartData(Array.isArray(json.chartData) ? json.chartData : [])
          setTotal(typeof json.total === 'number' ? json.total : 0)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load ticket stats')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [enabled, statusFilter])

  if (!enabled) return null

  if (loading) {
    return (
      <CompactChartCard
        title={title}
        description={t('raise_ticket_chart_loading', 'Loading…')}
        headerExtra={statusFilterControl}
      >
        <div className="min-h-[180px] flex items-center justify-center text-sm text-muted-foreground">
          {t('raise_ticket_chart_loading', 'Loading chart data…')}
        </div>
      </CompactChartCard>
    )
  }

  if (error) {
    return (
      <CompactChartCard
        title={title}
        description={t('raise_ticket_chart_error', 'Could not load')}
        headerExtra={statusFilterControl}
      >
        <div className="min-h-[180px] flex items-center justify-center text-sm text-destructive px-2 text-center">
          {error}
        </div>
      </CompactChartCard>
    )
  }

  return (
    <CompactChartCard title={title} description={description} headerExtra={statusFilterControl}>
      <div className="space-y-2.5" role="list" aria-label={title}>
        {chartData.map((row) => {
          const label = String(chartConfig[row.bigRock]?.label ?? row.bigRock)
          const widthPct = row.count > 0 ? Math.max((row.count / maxCount) * 100, 6) : 0

          return (
            <div
              key={row.bigRock}
              role="listitem"
              className="grid grid-cols-[minmax(7.5rem,9.5rem)_minmax(0,1fr)_1.75rem] items-center gap-2"
            >
              <span className="text-[11px] leading-snug text-muted-foreground text-right">
                {label}
              </span>
              <div className="relative h-3 min-w-0 rounded-sm bg-muted/35">
                {row.count > 0 ? (
                  <div
                    className="h-full rounded-sm"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: row.fill,
                    }}
                  />
                ) : null}
              </div>
              <span className="text-xs font-medium tabular-nums text-foreground text-right">
                {row.count}
              </span>
            </div>
          )
        })}
      </div>
    </CompactChartCard>
  )
}
