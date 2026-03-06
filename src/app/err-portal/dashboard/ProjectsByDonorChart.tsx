'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { Download, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { buildCsv, downloadCsv } from '@/lib/downloadCsv'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const CHART_COLORS = [
  '#9ee6c2', // mint
  '#7ec8e3', // sky blue
  '#d4a5d4', // lavender
  '#ffc9a4', // peach
  '#a8d4f0', // powder blue
  '#f5b5c8', // pink
]

type ApiResponse = {
  chartData: Record<string, string | number>[]
  series: string[]
}

interface ProjectsByDonorChartProps {
  dateFrom?: string
  dateTo?: string
}

function buildChartConfig(series: string[]): ChartConfig {
  const config: ChartConfig = {}
  series.forEach((donor, i) => {
    config[donor] = {
      label: donor,
      color: CHART_COLORS[i % CHART_COLORS.length],
    }
  })
  return config
}

export function ProjectsByDonorChart({ dateFrom, dateTo }: ProjectsByDonorChartProps) {
  const [chartData, setChartData] = useState<Record<string, string | number>[]>([])
  const [series, setSeries] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const params = new URLSearchParams()
        if (dateFrom) params.set('from', dateFrom)
        if (dateTo) params.set('to', dateTo)
        const qs = params.toString()
        const url = qs ? `/api/dashboard/projects-activities?${qs}` : '/api/dashboard/projects-activities'
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to load data')
        const json: ApiResponse = await res.json()
        if (!cancelled) {
          setChartData(Array.isArray(json.chartData) ? json.chartData : [])
          setSeries(Array.isArray(json.series) ? json.series : [])
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [dateFrom, dateTo])

  const chartConfig = useMemo(() => buildChartConfig(series), [series])

  const handleDownloadCsv = useCallback(() => {
    const headers: [string, string][] = [
      ['date_transfer', 'Date'],
      ...series.map((s) => [s, s] as [string, string]),
    ]
    const csv = buildCsv(chartData as Record<string, unknown>[], { headers })
    downloadCsv(csv, 'usd-by-donor-over-time.csv')
  }, [chartData, series])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>USD by Donor over Time</CardTitle>
          <CardDescription>Stacked cumulative by date_transfer</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground">
          Loading chart data…
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>USD by Donor over Time</CardTitle>
          <CardDescription>From projects_all_activities_view</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!chartData.length || !series.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>USD by Donor over Time</CardTitle>
          <CardDescription>From projects_all_activities_view</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    )
  }

  const lastPoint = chartData[chartData.length - 1]
  const totalUsd = series.reduce(
    (sum, donor) => sum + (Number(lastPoint?.[donor]) || 0),
    0
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>USD by Donor over Time</CardTitle>
          <CardDescription>
            Each line is the amount accumulated up to that date (overlapping by donor). Top 10 donors.
          </CardDescription>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-8 shrink-0"
          onClick={handleDownloadCsv}
          title="Download CSV"
          aria-label="Download chart data as CSV"
        >
          <Download className="size-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {series.map((donor, i) => (
            <div key={donor} className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full border border-white/50 shadow-sm"
                style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                aria-hidden
              />
              <span className="text-sm text-foreground">{donor}</span>
            </div>
          ))}
        </div>
        <ChartContainer config={chartConfig} className="min-h-[280px] w-full">
          <AreaChart
            accessibilityLayer
            data={chartData}
            margin={{ left: 12, right: 12 }}
            baseValue={0}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date_transfer"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) => {
                const d = new Date(value)
                return Number.isFinite(d.getTime())
                  ? d.toLocaleDateString('en-US', { month: 'short', year: '2-digit', day: 'numeric' })
                  : String(value)
              }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value) =>
                value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${(value / 1e3).toFixed(0)}k` : String(value)
              }
            />
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  labelKey="date_transfer"
                  formatter={(value) =>
                    Number(value).toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0,
                    })
                  }
                />
              }
            />
            <defs>
              {series.map((_, i) => {
                const color = CHART_COLORS[i % CHART_COLORS.length]
                const id = `fill-series-${i}`
                return (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={color} stopOpacity={0.8} />
                    <stop offset="95%" stopColor={color} stopOpacity={0.1} />
                  </linearGradient>
                )
              })}
            </defs>
            {series.map((donor, i) => {
              const color = CHART_COLORS[i % CHART_COLORS.length]
              const fillId = `fill-series-${i}`
              return (
                <Area
                  key={donor}
                  dataKey={donor}
                  type="monotone"
                  fill={`url(#${fillId})`}
                  fillOpacity={0.35}
                  stroke={color}
                  strokeWidth={2}
                  isAnimationActive={true}
                />
              )
            })}
          </AreaChart>
        </ChartContainer>
      </CardContent>
      <CardFooter>
        <div className="flex w-full items-start gap-2 text-sm">
          <div className="grid gap-2">
            <div className="flex items-center gap-2 leading-none font-medium">
              Cumulative total: {totalUsd.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}{' '}
              <TrendingUp className="h-4 w-4" />
            </div>
            <div className="text-muted-foreground flex items-center gap-2 leading-none">
              {series.length} donor series (overlapping, cumulative)
            </div>
          </div>
        </div>
      </CardFooter>
    </Card>
  )
}
