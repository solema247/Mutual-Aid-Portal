'use client'

import { useEffect, useMemo, useState } from 'react'
import { Label, Pie, PieChart } from 'recharts'
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
}

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
          setRows(list)
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

  const dataWithColors = useMemo(
    () =>
      rows.map((row, idx) => ({
        ...row,
        fill: RING_COLORS[idx % RING_COLORS.length],
      })),
    [rows]
  )

  const total = useMemo(
    () => rows.reduce((sum, r) => sum + (Number(r.total) || 0), 0),
    [rows]
  )

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Planned budget by sector</CardTitle>
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
          <CardTitle>Planned budget by sector</CardTitle>
          <CardDescription>From err_projects.planned_activities</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!dataWithColors.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Planned budget by sector</CardTitle>
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
      <CardHeader className="pb-0">
        <CardTitle>Planned budget by sector</CardTitle>
        <CardDescription>Planned costs (USD). Only projects that categorize activities by sector.</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 pb-0">
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
                    const currency = num.toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                      maximumFractionDigits: 0,
                    })
                    return `${currency} (${pct}%)`
                  }}
                />
              }
            />
            <Pie
              data={dataWithColors}
              dataKey="total"
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
                          {total.toLocaleString('en-US', {
                            style: 'currency',
                            currency: 'USD',
                            maximumFractionDigits: 0,
                          })}
                        </tspan>
                        <tspan
                          x={cx}
                          y={cy + 20}
                          className="text-xs opacity-80"
                        >
                          Total planned
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
      </CardContent>
    </Card>
  )
}

