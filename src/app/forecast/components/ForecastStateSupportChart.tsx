'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, XAxis, YAxis } from 'recharts'
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

const STATE_COLORS = [
  '#7ec8e3', '#d4a5d4', '#9ee6c2', '#f7c982', '#e89898',
  '#a8d5ba', '#c9b8e3', '#f0b873', '#98d4e0', '#e3c9b8',
  '#b8e3d4', '#e3b8d4', '#d4b8e3', '#b8c9e3', '#e3b8c9',
]

type MonthStateRow = { month: string; state_name: string; amount: number }

/** Format month for display: "2025-06" or "2025-06-30" → "Jun 2025" */
function formatMonthLabel(month: string): string {
  if (!month) return month
  const str = String(month).trim()
  const dateMatch = str.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (dateMatch) {
    const [, year, m] = dateMatch
    const date = new Date(parseInt(year, 10), parseInt(m, 10) - 1, 1)
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }
  return month
}

export function ForecastStateSupportChart() {
  const { t } = useTranslation(['forecast', 'common'])
  const [rows, setRows] = useState<MonthStateRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/forecast/state-support')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load state-support data')
        return res.json()
      })
      .then((raw: { month?: string | null; state_name?: string | null; amount?: number | null }[]) => {
        if (cancelled) return
        const list: MonthStateRow[] = (raw || [])
          .filter((r) => r.month != null && r.state_name != null && typeof r.amount === 'number' && r.amount > 0)
          .map((r) => ({
            month: String(r.month).trim(),
            state_name: String(r.state_name ?? 'Unknown').trim() || 'Unknown',
            amount: Number(r.amount),
          }))
        setRows(list)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  const { chartData, chartConfig, stateKeys } = useMemo(() => {
    const stateSet = new Set<string>()
    const byMonth = new Map<string, Record<string, number>>()
    for (const r of rows) {
      stateSet.add(r.state_name)
      const key = r.month
      if (!byMonth.has(key)) byMonth.set(key, {})
      const row = byMonth.get(key)!
      row[r.state_name] = (row[r.state_name] ?? 0) + r.amount
    }
    const stateKeys = Array.from(stateSet).sort()
    const chartData = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, stateAmounts]) => ({
        month: formatMonthLabel(month),
        monthKey: month,
        ...stateAmounts,
      }))
    const chartConfig: ChartConfig = {}
    stateKeys.forEach((name, i) => {
      chartConfig[name] = {
        label: name,
        color: STATE_COLORS[i % STATE_COLORS.length],
      }
    })
    return { chartData, chartConfig, stateKeys }
  }, [rows])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.state_support_title', 'State-level Support')}</CardTitle>
          <CardDescription>{t('common:loading')}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[320px] flex items-center justify-center text-muted-foreground text-sm">
          {t('common:loading')}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.state_support_title', 'State-level Support')}</CardTitle>
          <CardDescription>{t('forecast:charts.state_support_desc', 'Support by state per month')}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[320px] flex items-center justify-center text-destructive text-sm">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!chartData.length || !stateKeys.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.state_support_title', 'State-level Support')}</CardTitle>
          <CardDescription>{t('forecast:charts.state_support_desc', 'Support by state per month')}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[320px] flex items-center justify-center text-muted-foreground text-sm">
          {t('forecast:charts.no_data', 'No forecast data yet')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forecast:charts.state_support_title', 'State-level Support')}</CardTitle>
        <CardDescription>
          {t('forecast:charts.state_support_desc', 'Support by state per month (stacked).')}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mb-3">
          {stateKeys.map((name, i) => (
            <div key={name} className="flex items-center gap-1.5">
              <span
                className="size-3 shrink-0 rounded border border-border/50"
                style={{ backgroundColor: STATE_COLORS[i % STATE_COLORS.length] }}
                aria-hidden
              />
              <span className="text-xs text-foreground truncate max-w-[120px]" title={name}>
                {name}
              </span>
            </div>
          ))}
        </div>
        <ChartContainer config={chartConfig} className="min-h-[320px] w-full">
          <BarChart
            accessibilityLayer
            data={chartData}
            layout="vertical"
            margin={{ left: 8, right: 8 }}
          >
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) =>
                v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)
              }
            />
            <YAxis
              type="category"
              dataKey="month"
              width={72}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  formatter={(value) =>
                    Number(value).toLocaleString(undefined, { maximumFractionDigits: 0, minimumFractionDigits: 0 })
                  }
                />
              }
            />
            {stateKeys.map((stateName) => (
              <Bar
                key={stateName}
                dataKey={stateName}
                stackId="stack"
                fill={chartConfig[stateName]?.color ?? 'var(--chart-1)'}
                radius={0}
              />
            ))}
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
