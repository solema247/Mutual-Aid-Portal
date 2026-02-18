'use client'

import { type ComponentProps, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  XAxis,
  YAxis,
} from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { useForecastChartsRefresh } from './ForecastChartsRefreshContext'

/** Pastel colors to match Sankey and State-level Support charts */
const COMPLETE_COLOR = '#9ee6c2'  /* mint green */
const PLANNED_COLOR = '#7ec8e3'  /* soft blue */
/** Per-row height: bar (30px) + gap (18px) — readable with clear space between bars */
const ROW_HEIGHT = 48
const MIN_CHART_HEIGHT = 280

/** Format month for display: "2025-06-30" or "2025-06" → "June-25" */
function formatMonthLabel(month: string): string {
  if (!month) return month
  const str = String(month).trim()
  const dateMatch = str.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/)
  if (dateMatch) {
    const [, year, m] = dateMatch
    const date = new Date(parseInt(year, 10), parseInt(m, 10) - 1, 1)
    return date.toLocaleDateString(undefined, { month: 'long', year: '2-digit' })
  }
  return month
}

type ChartRow = { month: string; complete: number; planned: number }

/** Min bar width (px) to show value inside the bar; otherwise outside */
const MIN_BAR_WIDTH_FOR_INSIDE_LABEL = 72

/** Custom label: inside bar when it fits, outside when bar is too small */
function valueLabelContent(
  propsUnknown: unknown,
  formatter: (v: number) => string
) {
  const props = propsUnknown as { viewBox?: { width?: number }; value?: unknown; [key: string]: unknown }
  const width = props.viewBox?.width ?? 0
  const position = width >= MIN_BAR_WIDTH_FOR_INSIDE_LABEL ? 'insideRight' : 'right'
  const raw = props.value
  const text = typeof raw === 'number' ? formatter(raw) : String(raw ?? '')
  // Pass full props (including viewBox) so Label positions each bar's label correctly; assert type for Recharts LabelProps
  return <Label {...(props as ComponentProps<typeof Label>)} position={position} offset={8} value={text} />
}

export function ForecastStatusByMonthChart() {
  const { t } = useTranslation(['forecast', 'common'])
  const { refreshKey } = useForecastChartsRefresh()
  const [rows, setRows] = useState<ChartRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    fetch('/api/forecast/summary')
      .then((res) => {
        if (!res.ok) throw new Error('Failed to load summary')
        return res.json()
      })
      .then((data: Record<string, string | number>[]) => {
        if (cancelled) return
        if (!Array.isArray(data) || data.length === 0) {
          setRows([])
          setLoading(false)
          return
        }
        const chartRows: ChartRow[] = data.map((row) => ({
          month: String(row.month ?? ''),
          complete: Number(row.complete ?? 0) || 0,
          planned: Number(row.planned ?? 0) || 0,
        }))
        setRows(chartRows)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [refreshKey])

  const completeData = rows.map((r) => ({ month: r.month, value: r.complete }))
  const plannedData = rows.map((r) => ({ month: r.month, value: r.planned }))
  const totalComplete = rows.reduce((s, r) => s + r.complete, 0)
  const totalPlanned = rows.reduce((s, r) => s + r.planned, 0)
  /** Height so each row has ROW_HEIGHT px; cap so chart doesn’t dominate the page */
  const chartHeight = rows.length
    ? Math.min(Math.max(MIN_CHART_HEIGHT, rows.length * ROW_HEIGHT), 400)
    : 280

  const completeConfig = {
    value: { label: 'Complete', color: COMPLETE_COLOR },
    month: { label: 'Month' },
    label: { color: 'var(--background)' },
  } satisfies ChartConfig

  const plannedConfig = {
    value: { label: 'Planned', color: PLANNED_COLOR },
    month: { label: 'Month' },
    label: { color: 'var(--background)' },
  } satisfies ChartConfig

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.status_by_month_title', 'Mutual Aid forecast by status and month')}</CardTitle>
          <CardDescription>{t('forecast:charts.status_by_month_desc', 'Amount by month and status')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[280px]">
          <p className="text-sm text-muted-foreground">{t('common:loading')}</p>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.status_by_month_title', 'Mutual Aid forecast by status and month')}</CardTitle>
          <CardDescription>{t('forecast:charts.status_by_month_desc', 'Amount by month and status')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[280px]">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    )
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('forecast:charts.status_by_month_title', 'Mutual Aid forecast by status and month')}</CardTitle>
          <CardDescription>{t('forecast:charts.status_by_month_desc', 'Amount by month and status')}</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center min-h-[280px]">
          <p className="text-sm text-muted-foreground">{t('forecast:charts.no_data', 'No forecast data yet')}</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('forecast:charts.status_by_month_title', 'Mutual Aid forecast by status and month')}</CardTitle>
        <CardDescription>{t('forecast:charts.status_by_month_desc', 'Amount by month and status')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Column 1: Month labels | Column 2: Complete bars | Column 3: Planned bars */}
        <div className="grid grid-cols-[minmax(5rem,auto)_1fr_1fr] gap-4 min-w-0">
          {/* Header row so month labels and charts start at same vertical position */}
          <div className="text-sm font-medium text-muted-foreground">Month</div>
          <div className="text-sm font-medium text-center">Complete</div>
          <div className="text-sm font-medium text-center">Planned</div>

          {/* Column 1: Month labels only — same height as chart so row heights match */}
          <div
            className="flex flex-col justify-stretch text-sm text-muted-foreground min-h-0"
            style={{ height: `${chartHeight}px` }}
          >
            {rows.map((r) => (
              <div key={r.month} className="flex flex-1 min-h-0 items-center pr-2">
                {formatMonthLabel(r.month)}
              </div>
            ))}
          </div>

          {/* Column 2: Complete bars (no month label) */}
          <div className="min-h-0 min-w-0 overflow-hidden">
            <ChartContainer config={completeConfig} className="w-full !max-h-none min-w-0" style={{ height: `${chartHeight}px` }}>
              <BarChart
                accessibilityLayer
                data={completeData}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                barCategoryGap={0}
              >
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="month" type="category" hide />
                <XAxis dataKey="value" type="number" hide />
                <Bar dataKey="value" fill={COMPLETE_COLOR} radius={4} barSize={30}>
                  <LabelList
                    dataKey="value"
                    content={(props) =>
                      valueLabelContent(props, (v) => (v ? v.toLocaleString() : ''))
                    }
                    className="fill-foreground"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>

          {/* Column 3: Planned bars (no month label) */}
          <div className="min-h-0 min-w-0 overflow-hidden">
            <ChartContainer config={plannedConfig} className="w-full !max-h-none min-w-0" style={{ height: `${chartHeight}px` }}>
              <BarChart
                accessibilityLayer
                data={plannedData}
                layout="vertical"
                margin={{ top: 0, right: 24, bottom: 0, left: 0 }}
                barCategoryGap={0}
              >
                <CartesianGrid horizontal={false} />
                <YAxis dataKey="month" type="category" hide />
                <XAxis dataKey="value" type="number" hide />
                <Bar dataKey="value" fill={PLANNED_COLOR} radius={4} barSize={30}>
                  <LabelList
                    dataKey="value"
                    content={(props) =>
                      valueLabelContent(props, (v) => (v ? v.toLocaleString() : '–'))
                    }
                    className="fill-foreground"
                    fontSize={12}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </div>
        </div>

        {/* Grand total */}
        <div className="flex justify-end gap-8 pt-2 border-t text-sm">
          <span>
            <span className="text-muted-foreground">Complete total: </span>
            <span className="font-mono font-medium">{totalComplete.toLocaleString()}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Planned total: </span>
            <span className="font-mono font-medium">{totalPlanned.toLocaleString()}</span>
          </span>
        </div>
      </CardContent>
    </Card>
  )
}
