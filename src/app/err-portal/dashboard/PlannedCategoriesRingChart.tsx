'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { Label, Pie, PieChart } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { buildCsv, downloadCsv } from '@/lib/downloadCsv'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const RING_COLORS = [
  '#9ee6c2', // mint
  '#7ec8e3', // sky blue
  '#d4a5d4', // lavender
  '#ffc9a4', // peach
  '#a8d4f0', // powder blue
  '#f5b5c8', // pink
  '#b5e0b5', // sage
  '#e8d4a0', // sand
]

type CategoryRow = {
  category: string
  total: number
  families: number
  individuals: number
}

type PieMetric = 'total' | 'families' | 'individuals'

const METRIC_OPTIONS: { value: PieMetric; label: string }[] = [
  { value: 'total', label: 'USD Amount' },
  { value: 'individuals', label: 'Individuals' },
  { value: 'families', label: 'Families' },
]

interface PlannedCategoriesRingChartProps {
  dateFrom?: string
  dateTo?: string
}

const chartConfig = {
  amount: {
    label: 'USD',
  },
} satisfies ChartConfig

const RADIAN = Math.PI / 180
const LABEL_OFFSET = 12
const CONNECTOR_LENGTH = 18
const SMALL_SEGMENT_PERCENT = 0.08 // use connector line when segment is smaller than 8%

export function PlannedCategoriesRingChart({
  dateFrom,
  dateTo,
}: PlannedCategoriesRingChartProps) {
  const [rows, setRows] = useState<CategoryRow[]>([])
  const [projectCount, setProjectCount] = useState(0)
  const [metric, setMetric] = useState<PieMetric>('total')
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
        const url = qs
          ? `/api/dashboard/planned-categories?${qs}`
          : '/api/dashboard/planned-categories'
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to load data')
        const json = await res.json()
        if (!cancelled) {
          const list = Array.isArray(json?.categories) ? json.categories : []
          setRows(
            list.map((r: Record<string, unknown>) => ({
              category: String(r.category ?? ''),
              total: Number(r.total) || 0,
              families: Number(r.families) || 0,
              individuals: Number(r.individuals) || 0,
            }))
          )
          setProjectCount(typeof json?.projectCount === 'number' ? json.projectCount : 0)
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => {
      cancelled = true
    }
  }, [dateFrom, dateTo])

  const dataWithColors = useMemo(() => {
    const withValue = rows
      .map((row, idx) => ({
        ...row,
        value: row[metric] as number,
        fill: RING_COLORS[idx % RING_COLORS.length],
      }))
      .filter((r) => r.value > 0)
    return withValue.sort((a, b) => b.value - a.value)
  }, [rows, metric])

  const total = useMemo(
    () => dataWithColors.reduce((sum, r) => sum + r.value, 0),
    [dataWithColors]
  )

  const handleDownloadCsv = useCallback(() => {
    const headers: [keyof CategoryRow, string][] = [
      ['category', 'Category'],
      ['total', 'Total (USD)'],
      ['individuals', 'Individuals'],
      ['families', 'Families'],
    ]
    const csv = buildCsv(rows, { headers })
    downloadCsv(csv, 'planned-budget-by-sector.csv')
  }, [rows])

  const formatCenterValue = (val: number) =>
    metric === 'total'
      ? val.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          maximumFractionDigits: 0,
        })
      : val.toLocaleString('en-US', { maximumFractionDigits: 0 })

  const centerSubtitle =
    metric === 'total'
      ? 'Total planned'
      : metric === 'individuals'
        ? 'Total individuals'
        : 'Total families'

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>F1 Work Plans by Sector</CardTitle>
          <CardDescription>Loading…</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground">
          Loading…
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>F1 Work Plans by Sector</CardTitle>
          <CardDescription>From err_projects.planned_activities</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!rows.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>F1 Work Plans by Sector</CardTitle>
          <CardDescription>From err_projects.planned_activities</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-0">
        <div className="space-y-1.5">
          <CardTitle>F1 Work Plans by Sector</CardTitle>
          <CardDescription>View by USD amount, individuals, or families. Only projects that categorize activities by sector.</CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select value={metric} onValueChange={(v) => setMetric(v as PieMetric)}>
            <SelectTrigger className="h-7 w-auto min-w-0 rounded-full px-3 text-xs" size="sm">
              <SelectValue placeholder="View by…" />
            </SelectTrigger>
            <SelectContent>
              {METRIC_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
        </div>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
        {dataWithColors.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center text-muted-foreground text-sm">
            No data for this metric. Try another option.
          </div>
        ) : (
        <ChartContainer
          config={chartConfig}
          className="mx-auto aspect-square max-h-[380px] text-foreground"
        >
          <PieChart>
            <ChartTooltip
              cursor={false}
              content={
                <ChartTooltipContent
                  hideLabel={false}
                  labelKey="category"
                  formatter={(value) => {
                    const num = Number(value)
                    const pct = total > 0 ? ((num / total) * 100).toFixed(1) : '0'
                    return `${formatCenterValue(num)} (${pct}%)`
                  }}
                />
              }
            />
            <Pie
              data={dataWithColors}
              dataKey="value"
              nameKey="category"
              innerRadius={100}
              strokeWidth={5}
              paddingAngle={1}
              label={({
                cx,
                cy,
                midAngle,
                outerRadius,
                percent,
                name,
                fill,
              }: {
                cx: number
                cy: number
                midAngle: number
                outerRadius: number
                percent: number
                name: string
                fill: string
              }) => {
                const sin = Math.sin(-RADIAN * midAngle)
                const cos = Math.cos(-RADIAN * midAngle)
                const outerX = cx + outerRadius * cos
                const outerY = cy + outerRadius * sin
                const useConnector = percent < SMALL_SEGMENT_PERCENT
                const labelRadius = outerRadius + (useConnector ? CONNECTOR_LENGTH : LABEL_OFFSET)
                const labelX = cx + labelRadius * cos
                const labelY = cy + labelRadius * sin
                const isRight = cos >= 0
                return (
                  <g>
                    {useConnector && (
                      <line
                        x1={outerX}
                        y1={outerY}
                        x2={labelX}
                        y2={labelY}
                        stroke={fill}
                        strokeWidth={1}
                        strokeOpacity={0.7}
                      />
                    )}
                    <text
                      x={labelX}
                      y={labelY}
                      textAnchor={isRight ? 'start' : 'end'}
                      dominantBaseline="middle"
                      fill="currentColor"
                      className="text-[10px] fill-foreground"
                      style={{ fill: 'currentColor' }}
                    >
                      {name}
                    </text>
                  </g>
                )
              }}
            >
              <Label
                content={({ viewBox }) => {
                  if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                    const cx = viewBox.cx as number
                    const cy = viewBox.cy as number
                    return (
                      <text
                        x={cx}
                        y={cy}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        fill="currentColor"
                      >
                        <tspan
                          x={cx}
                          y={cy}
                          className="text-xl font-bold"
                        >
                          {formatCenterValue(total)}
                        </tspan>
                        <tspan
                          x={cx}
                          y={cy + 20}
                          className="text-xs opacity-80"
                        >
                          {centerSubtitle}
                        </tspan>
                        <tspan
                          x={cx}
                          y={cy + 36}
                          className="text-xs opacity-80"
                        >
                          {projectCount} project{projectCount !== 1 ? 's' : ''}
                        </tspan>
                      </text>
                    )
                  }
                }}
              />
            </Pie>
          </PieChart>
        </ChartContainer>
        )}
      </CardContent>
    </Card>
  )
}

