'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from 'recharts'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import {
  GITHUB_PROJECT_STATUS_CHART_ORDER,
  RAISE_TICKET_BIG_ROCK_I18N_KEYS,
  RAISE_TICKET_STATUS_I18N_KEYS,
  RAISE_TICKET_TASK_TYPE_SHORT_I18N_KEYS,
  STATUS_CHART_COLORS,
  STATUS_SERIES,
  type BigRockTaskChartPoint,
  type GithubProjectBigRock,
  type StatusDataKey,
} from '@/lib/raiseTicketGithub'

type ApiResponse = {
  chartData: BigRockTaskChartPoint[]
  series: StatusDataKey[]
  total: number
}

interface BigRockTaskStatusChartProps {
  bigRock: GithubProjectBigRock
  enabled?: boolean
}

function CompactChartCard ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-1.5 p-4 pb-2">
        <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
        <CardDescription className="text-xs leading-snug">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  )
}

export function BigRockTaskStatusChart ({
  bigRock,
  enabled = true,
}: BigRockTaskStatusChartProps) {
  const { t } = useTranslation('err')
  const [chartData, setChartData] = useState<BigRockTaskChartPoint[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const chartConfig = useMemo(() => {
    const config: ChartConfig = {}
    for (const key of STATUS_SERIES) {
      const status = GITHUB_PROJECT_STATUS_CHART_ORDER[STATUS_SERIES.indexOf(key)]
      config[key] = {
        label: t(RAISE_TICKET_STATUS_I18N_KEYS[status], status),
        color: STATUS_CHART_COLORS[key],
      }
    }
    return config
  }, [t])

  const title = t(RAISE_TICKET_BIG_ROCK_I18N_KEYS[bigRock], bigRock)
  const description = t(
    'raise_ticket_chart_system_status_matrix_desc',
    'Status by Type of Task · {{count}} tickets',
    { count: total }
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function fetchData () {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(
          `/api/support/github-tickets/by-status?bigRock=${encodeURIComponent(bigRock)}`
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
  }, [enabled, bigRock])

  if (!enabled) return null

  if (loading) {
    return (
      <CompactChartCard title={title} description={t('raise_ticket_chart_loading', 'Loading…')}>
        <div className="min-h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          {t('raise_ticket_chart_loading', 'Loading chart data…')}
        </div>
      </CompactChartCard>
    )
  }

  if (error) {
    return (
      <CompactChartCard title={title} description={t('raise_ticket_chart_error', 'Could not load')}>
        <div className="min-h-[200px] flex items-center justify-center text-sm text-destructive px-2 text-center">
          {error}
        </div>
      </CompactChartCard>
    )
  }

  if (!chartData.length) {
    return (
      <CompactChartCard title={title} description={description}>
        <div className="min-h-[160px] flex items-center justify-center text-sm text-muted-foreground px-2 text-center">
          {t(
            'raise_ticket_chart_no_task_types',
            'No Type of Task values on the board for this Big Rock yet.'
          )}
        </div>
      </CompactChartCard>
    )
  }

  return (
    <CompactChartCard title={title} description={description}>
      <div className="mb-3 flex flex-wrap gap-x-3 gap-y-1.5">
        {STATUS_SERIES.map((key) => (
          <div key={key} className="flex items-center gap-1.5">
            <span
              className="size-2.5 shrink-0 rounded-sm"
              style={{ backgroundColor: STATUS_CHART_COLORS[key] }}
              aria-hidden
            />
            <span className="text-[10px] text-muted-foreground leading-tight">
              {chartConfig[key]?.label}
            </span>
          </div>
        ))}
      </div>
      <ChartContainer
        config={chartConfig}
        className="h-[200px] w-full !aspect-auto max-h-none"
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          margin={{ left: 0, right: 4, top: 20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="taskTypeLabel"
            tickLine={false}
            tickMargin={8}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 9 }}
            tickFormatter={(value) => {
              const i18nKey = RAISE_TICKET_TASK_TYPE_SHORT_I18N_KEYS[value as string]
              return i18nKey ? t(i18nKey, String(value)) : String(value)
            }}
          />
          <ChartTooltip
            cursor={false}
            content={<ChartTooltipContent indicator="dashed" />}
          />
          {STATUS_SERIES.map((key) => (
            <Bar
              key={key}
              dataKey={key}
              fill={STATUS_CHART_COLORS[key]}
              radius={4}
            >
              <LabelList
                dataKey={key}
                position="top"
                offset={4}
                className="fill-foreground"
                fontSize={10}
                formatter={(value: number) => (value > 0 ? value : '')}
              />
            </Bar>
          ))}
        </BarChart>
      </ChartContainer>
    </CompactChartCard>
  )
}
