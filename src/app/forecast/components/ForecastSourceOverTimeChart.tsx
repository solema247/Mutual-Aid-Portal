'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
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
import { useForecastChartsRefresh } from './ForecastChartsRefreshContext'

/** Pastel colors to match other forecast charts (Funding Sources) */
const SOURCE_COLORS = ['#7ec8e3', '#f7c982', '#d4a5d4', '#9ee6c2', '#e89898', '#c9b8e3']

/** Normalize month to "YYYY-MM" */
function normalizeMonthKey(month: string): string {
  if (!month) return month
  const str = String(month).trim()
  const m = str.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (m) return `${m[1]}-${m[2]}`
  return str
}

/** Format month for X-axis: "Jan 2025" */
function formatMonthLabel(month: string): string {
  if (!month) return month
  const str = String(month).trim()
  const m = str.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (m) {
    const date = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, 1)
    return date.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
  }
  return month
}

/** Safe key for chart dataKey/config (no spaces) so fill color resolves correctly in Recharts */
function sourceSafeKey(name: string): string {
  return String(name).replace(/\s+/g, '_')
}

type MonthSourceRow = { month: string; source: string; amount: number }

export function ForecastSourceOverTimeChart() {
  const { t } = useTranslation(['forecast', 'common'])
  const { refreshKey } = useForecastChartsRefresh()
  const [rows, setRows] = useState<MonthSourceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/forecast/source-by-month')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load source-by-month data')
        return res.json()
      })
      .then((raw: { month?: string | null; source?: string | null; amount?: number | null }[]) => {
        if (cancelled) return
        const list: MonthSourceRow[] = (raw || [])
          .filter((r) => r.month != null && r.source != null && typeof r.amount === 'number' && r.amount > 0)
          .map((r) => ({
            month: normalizeMonthKey(String(r.month).trim()),
            source: String(r.source ?? 'Unknown').trim() || 'Unknown',
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
  }, [refreshKey])

  const { chartData, chartConfig, sourceKeys, sourceKeysDisplay } = useMemo(() => {
    const sourceSet = new Set<string>()
    const byMonth = new Map<string, Record<string, number>>()
    for (const r of rows) {
      sourceSet.add(r.source)
      const key = r.month
      if (!byMonth.has(key)) byMonth.set(key, {})
      const row = byMonth.get(key)!
      row[r.source] = (row[r.source] ?? 0) + r.amount
    }
    const sourceKeysDisplay = Array.from(sourceSet).sort()
    const sourceKeys = sourceKeysDisplay.map(sourceSafeKey)
    const chartData = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, sourceAmounts]) => {
        const point: Record<string, string | number> = {
          month: formatMonthLabel(month),
          monthKey: month,
        }
        for (const name of sourceKeysDisplay) {
          point[sourceSafeKey(name)] = sourceAmounts[name] ?? 0
        }
        return point
      })
    const chartConfig: ChartConfig = {}
    sourceKeys.forEach((safeKey, i) => {
      chartConfig[safeKey] = {
        label: sourceKeysDisplay[i],
        color: SOURCE_COLORS[i % SOURCE_COLORS.length],
      }
    })
    return { chartData, chartConfig, sourceKeys, sourceKeysDisplay }
  }, [rows])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.funding_sources_title', 'Funding Sources by month')}</CardTitle>
          <CardDescription>{t('common:loading')}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[280px] flex items-center justify-center text-muted-foreground text-sm">
          {t('common:loading')}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.funding_sources_title', 'Funding Sources by month')}</CardTitle>
          <CardDescription>{t('forecast:charts.funding_sources_desc', 'Funding by source over time')}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[280px] flex items-center justify-center text-destructive text-sm">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!chartData.length || !sourceKeys.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.funding_sources_title', 'Funding Sources by month')}</CardTitle>
          <CardDescription>{t('forecast:charts.funding_sources_desc', 'Funding by source over time')}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[280px] flex items-center justify-center text-muted-foreground text-sm">
          {t('forecast:charts.no_data', 'No forecast data yet')}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forecast:charts.funding_sources_title', 'Funding Sources by month')}</CardTitle>
        <CardDescription>
          {t('forecast:charts.funding_sources_desc', 'Funding by source over time')}
        </CardDescription>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[280px] w-full"
        >
          <AreaChart data={chartData} margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
            <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeOpacity={0.5} />
            <XAxis
              dataKey="month"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) =>
                v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}K` : String(v)
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelFormatter={(value: string) => value}
                  formatter={(v) => (typeof v === 'number' ? v.toLocaleString() : String(v ?? '–'))}
                  indicator="dot"
                />
              }
            />
            {sourceKeys.map((safeKey, i) => {
              const color = chartConfig[safeKey]?.color ?? SOURCE_COLORS[i % SOURCE_COLORS.length]
              return (
                <Area
                  key={safeKey}
                  dataKey={safeKey}
                  type="natural"
                  fill={color}
                  fillOpacity={0.9}
                  stroke={color}
                  stackId="a"
                />
              )
            })}
          </AreaChart>
        </ChartContainer>
        <div
          className="flex flex-wrap gap-x-6 gap-y-1 pt-3 border-t border-border/50 mt-3 justify-center"
          role="list"
          aria-label="Legend"
        >
          {sourceKeysDisplay.map((name, i) => (
            <div key={sourceKeys[i]} className="flex items-center gap-1.5 text-xs" role="listitem">
              <span
                className="size-3 shrink-0 rounded border border-border/50"
                style={{ backgroundColor: SOURCE_COLORS[i % SOURCE_COLORS.length] }}
                aria-hidden
              />
              <span className="text-foreground">{name}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
