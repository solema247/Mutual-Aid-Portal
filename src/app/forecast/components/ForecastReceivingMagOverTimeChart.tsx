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

/** Pastel colors to match other forecast charts (Receiving MAG) */
const MAG_COLORS = ['#7ec8e3', '#f7c982', '#d4a5d4', '#9ee6c2', '#e89898', '#c9b8e3']

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
function magSafeKey(name: string): string {
  return String(name).replace(/\s+/g, '_')
}

type MonthReceivingMagRow = { month: string; receiving_mag: string; amount: number }

export function ForecastReceivingMagOverTimeChart() {
  const { t } = useTranslation(['forecast', 'common'])
  const { refreshKey } = useForecastChartsRefresh()
  const [rows, setRows] = useState<MonthReceivingMagRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/forecast/receiving-mag-by-month')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load receiving-mag-by-month data')
        return res.json()
      })
      .then((raw: { month?: string | null; receiving_mag?: string | null; amount?: number | null }[]) => {
        if (cancelled) return
        const list: MonthReceivingMagRow[] = (raw || [])
          .filter((r) => r.month != null && r.receiving_mag != null && typeof r.amount === 'number' && r.amount > 0)
          .map((r) => ({
            month: normalizeMonthKey(String(r.month).trim()),
            receiving_mag: String(r.receiving_mag ?? 'Unknown').trim() || 'Unknown',
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

  const { chartData, chartConfig, magKeys, magKeysDisplay } = useMemo(() => {
    const magSet = new Set<string>()
    const byMonth = new Map<string, Record<string, number>>()
    for (const r of rows) {
      magSet.add(r.receiving_mag)
      const key = r.month
      if (!byMonth.has(key)) byMonth.set(key, {})
      const row = byMonth.get(key)!
      row[r.receiving_mag] = (row[r.receiving_mag] ?? 0) + r.amount
    }
    const magKeysDisplay = Array.from(magSet).sort()
    const magKeys = magKeysDisplay.map(magSafeKey)
    const chartData = Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, magAmounts]) => {
        const point: Record<string, string | number> = {
          month: formatMonthLabel(month),
          monthKey: month,
        }
        for (const name of magKeysDisplay) {
          point[magSafeKey(name)] = magAmounts[name] ?? 0
        }
        return point
      })
    const chartConfig: ChartConfig = {}
    magKeys.forEach((safeKey, i) => {
      chartConfig[safeKey] = {
        label: magKeysDisplay[i],
        color: MAG_COLORS[i % MAG_COLORS.length],
      }
    })
    return { chartData, chartConfig, magKeys, magKeysDisplay }
  }, [rows])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.receiving_mag_title', 'Receiving MAG by month')}</CardTitle>
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
          <CardTitle>{t('forecast:charts.receiving_mag_title', 'Receiving MAG by month')}</CardTitle>
          <CardDescription>{t('forecast:charts.receiving_mag_desc', 'Funding by receiving MAG over time')}</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[280px] flex items-center justify-center text-destructive text-sm">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!chartData.length || !magKeys.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.receiving_mag_title', 'Receiving MAG by month')}</CardTitle>
          <CardDescription>{t('forecast:charts.receiving_mag_desc', 'Funding by receiving MAG over time')}</CardDescription>
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
        <CardTitle>{t('forecast:charts.receiving_mag_title', 'Receiving MAG by month')}</CardTitle>
        <CardDescription>
          {t('forecast:charts.receiving_mag_desc', 'Funding by receiving MAG over time (stacked).')}
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
            {magKeys.map((safeKey, i) => {
              const color = chartConfig[safeKey]?.color ?? MAG_COLORS[i % MAG_COLORS.length]
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
          {magKeysDisplay.map((name, i) => (
            <div key={magKeys[i]} className="flex items-center gap-1.5 text-xs" role="listitem">
              <span
                className="size-3 shrink-0 rounded border border-border/50"
                style={{ backgroundColor: MAG_COLORS[i % MAG_COLORS.length] }}
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
