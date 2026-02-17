'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Rectangle, XAxis, YAxis } from 'recharts'
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

/** 18 distinct colors for 18 states – one color per state, no repeat */
const STATE_COLORS = [
  '#7ec8e3', '#d4a5d4', '#9ee6c2', '#f7c982', '#e89898',
  '#a8d5ba', '#c9b8e3', '#f0b873', '#98d4e0', '#e3c9b8',
  '#b8e3d4', '#e3b8d4', '#d4b8e3', '#b8c9e3', '#e3b8c9',
  '#8b9dc3', '#c4a77d', '#a8c698', '#e8a87c',
]

type MonthStateRow = { month: string; state_name: string; amount: number }

type TooltipPayloadItem = { value?: number; dataKey?: string; name?: string; color?: string }
type TooltipPanelState = { label: string; payload: TooltipPayloadItem[] } | null

/** Normalize month to "YYYY-MM" so "2025-07-30" and "2025-07" become one key */
function normalizeMonthKey(month: string): string {
  if (!month) return month
  const str = String(month).trim()
  const dateMatch = str.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (dateMatch) {
    const [, year, m] = dateMatch
    return `${year}-${m}`
  }
  return str
}

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
  const [tooltipPanel, setTooltipPanel] = useState<TooltipPanelState>(null)
  const [pinnedMonthLabel, setPinnedMonthLabel] = useState<string | null>(null)
  const lastTooltipKeyRef = useRef<string | null>(null)
  const chartWrapperRef = useRef<HTMLDivElement>(null)

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
      const key = normalizeMonthKey(r.month)
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

  const pinnedTooltipContent = useMemo((): TooltipPanelState => {
    if (!pinnedMonthLabel || !chartData.length || !stateKeys.length) return null
    const row = chartData.find((d) => d.month === pinnedMonthLabel)
    if (!row) return null
    const payload: TooltipPayloadItem[] = stateKeys
      .filter((name) => (row[name] ?? 0) > 0)
      .map((name) => ({
        dataKey: name,
        name,
        value: row[name],
        color: chartConfig[name]?.color,
      }))
    return { label: pinnedMonthLabel, payload }
  }, [pinnedMonthLabel, chartData, chartConfig, stateKeys])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (chartWrapperRef.current && !chartWrapperRef.current.contains(e.target as Node)) {
        setPinnedMonthLabel(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

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
    <Card className="flex flex-1 flex-col min-h-0">
      <CardHeader>
        <CardTitle>{t('forecast:charts.state_support_title', 'State-level Support')}</CardTitle>
        <CardDescription>
          {t('forecast:charts.state_support_desc', 'Support by state per month (stacked).')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col min-h-0">
        <div ref={chartWrapperRef} className="relative min-h-[480px] outline-none [&_*]:outline-none">
          <ChartContainer config={chartConfig} className="min-h-[480px] w-full outline-none">
            <BarChart
              accessibilityLayer
              data={chartData}
              layout="vertical"
              margin={{ left: 20, right: 8 }}
              barCategoryGap={4}
              onClick={(data) => {
                const month = data?.month != null ? String(data.month) : null
                setPinnedMonthLabel((prev) => (prev === month ? null : month))
              }}
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
                width={80}
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                interval={0}
              />
              <CartesianGrid horizontal={false} vertical stroke="hsl(var(--border))" strokeOpacity={0.5} />
              <ChartTooltip
                cursor={false}
                content={({ active, payload, label }) => {
                  const key = active && payload?.length ? String(label ?? '') : null
                  if (key === lastTooltipKeyRef.current) return null
                  lastTooltipKeyRef.current = key
                  const next: TooltipPanelState =
                    active && payload?.length ? { label: String(label ?? ''), payload } : null
                  queueMicrotask(() => setTooltipPanel(next))
                  return null
                }}
              />
              {stateKeys.map((stateName) => (
                <Bar
                  key={stateName}
                  dataKey={stateName}
                  stackId="stack"
                  fill={chartConfig[stateName]?.color ?? 'var(--chart-1)'}
                  radius={0}
                  shape={(props) => (
                    <Rectangle
                      {...props}
                      fillOpacity={
                        pinnedMonthLabel == null || props.payload?.month === pinnedMonthLabel ? 1 : 0.3
                      }
                    />
                  )}
                />
              ))}
            </BarChart>
          </ChartContainer>
          <div className="absolute right-3 top-0 w-52 max-h-[min(30rem,80%)] rounded-lg px-3 py-2 text-xs pointer-events-none bg-background/90 z-10">
            {(pinnedTooltipContent ?? tooltipPanel) ? (
              <>
                <div className="font-medium text-foreground border-b border-border pb-1.5 mb-1.5">
                  {(pinnedTooltipContent ?? tooltipPanel)!.label}
                </div>
                <div className="grid gap-1 max-h-[26rem] overflow-y-auto">
                  {(pinnedTooltipContent ?? tooltipPanel)!.payload
                    .filter((item) => item.value != null && Number(item.value) > 0)
                    .map((item) => {
                      const key = item.dataKey ?? item.name ?? ''
                      const configItem = chartConfig[key as string]
                      const color = configItem?.color ?? item.color
                      const label = configItem?.label ?? key
                      const value = Number(item.value).toLocaleString(undefined, {
                        maximumFractionDigits: 0,
                        minimumFractionDigits: 0,
                      })
                      return (
                        <div key={key} className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-1.5 min-w-0">
                            <span
                              className="size-2.5 shrink-0 rounded-sm"
                              style={{ backgroundColor: color }}
                              aria-hidden
                            />
                            <span className="text-muted-foreground truncate">{label}</span>
                          </span>
                          <span className="font-mono font-medium text-foreground shrink-0">{value}</span>
                        </div>
                      )
                    })}
                </div>
              </>
            ) : null}
          </div>
        </div>
        <div
          className="overflow-x-auto overflow-y-hidden border-t border-border/50 pt-3 mt-3 pb-1"
          role="list"
          aria-label="Legend"
          style={{
            display: 'grid',
            gridAutoFlow: 'column',
            gridTemplateRows: 'repeat(3, 1rem)',
            gridAutoColumns: 'minmax(7rem, auto)',
            gap: '0 0',
            columnGap: '0.5rem',
            justifyItems: 'start',
          }}
        >
          {stateKeys.map((name, i) => (
            <div
              key={name}
              className="flex items-center gap-1.5 text-xs min-w-0 max-w-[7rem] relative bg-background pl-0.5 pr-1"
              role="listitem"
              style={{ zIndex: i, marginRight: '-0.4rem' }}
            >
              <span
                className="size-3 shrink-0 rounded border border-border/50"
                style={{ backgroundColor: STATE_COLORS[i % STATE_COLORS.length] }}
                aria-hidden
              />
              <span className="text-foreground truncate min-w-0" title={name}>
                {name}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}
