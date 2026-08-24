'use client'

import { useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
import { RefreshCw } from 'lucide-react'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from '@/components/ui/chart'
import { SmartFilter } from '@/components/smart-filter'
import { useFilteredPoolByState } from './useFilteredPoolByState'

const POOL_COLORS = {
  assigned: '#7ec8e3',
  committed: '#9ee6c2',
  pending: '#ffc9a4',
} as const

const money = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

const stateUseConfig = {
  assigned_pct: { label: 'Assigned', color: POOL_COLORS.assigned },
  committed_pct: { label: 'Committed', color: POOL_COLORS.committed },
  pending_pct: { label: 'Pending', color: POOL_COLORS.pending },
  remaining_gap: { label: 'Balance', color: '#e2e8f0' },
} satisfies ChartConfig

export default function PoolOverviewCharts() {
  const { filters, setFilters, filterFields, byState, loading, loadData } = useFilteredPoolByState()

  const { stateUseData, xMax } = useMemo(() => {
    const rows = [...byState]
      .map((r) => {
        const allocated = Number(r.allocated) || 0
        const assigned = Number(r.assigned) || 0
        const committed = Number(r.committed) || 0
        const pending = Number(r.pending) || 0
        if (allocated <= 0) return null
        const assigned_pct = (assigned / allocated) * 100
        const committed_pct = (committed / allocated) * 100
        const pending_pct = (pending / allocated) * 100
        const used_pct = assigned_pct + committed_pct + pending_pct
        const remaining_gap = Math.max(0, 100 - used_pct)
        return {
          state: r.state_name,
          allocated,
          assigned,
          committed,
          pending,
          assigned_pct,
          committed_pct,
          pending_pct,
          remaining_gap,
          used_pct,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r != null)
      .sort((a, b) => a.state.localeCompare(b.state))

    const maxUsed = rows.reduce((m, r) => Math.max(m, r.used_pct), 0)
    return {
      stateUseData: rows,
      xMax: Math.max(100, Math.ceil(maxUsed / 10) * 10),
    }
  }, [byState])

  const barChartHeight = Math.max(360, stateUseData.length * 28)

  const allocatedEndLabel = (props: {
    x?: string | number
    y?: string | number
    width?: string | number
    height?: string | number
    index?: number
  }) => {
    const { x = 0, y = 0, width = 0, height = 0, index } = props
    const row = typeof index === 'number' ? stateUseData[index] : undefined
    if (!row) return null
    const endX = Number(x) + Number(width)
    const midY = Number(y) + Number(height) / 2
    return (
      <text
        x={endX + 8}
        y={midY}
        dominantBaseline="middle"
        className="fill-foreground"
        style={{ fontSize: 11, fontWeight: 600 }}
      >
        {money(row.allocated)}
      </text>
    )
  }

  return (
    <Card>
      <CardHeader className="space-y-3 pb-2">
        <div className="flex flex-row items-start justify-between gap-2">
          <CardTitle className="text-base">Allocation use by state</CardTitle>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
        <SmartFilter
          fields={filterFields}
          filters={filters}
          onFiltersChange={setFilters}
          urlParamPrefix="au_"
        />
      </CardHeader>
      <CardContent>
        {loading && stateUseData.length === 0 ? (
          <div className="min-h-[260px] flex items-center justify-center text-muted-foreground text-sm">
            Loading…
          </div>
        ) : stateUseData.length === 0 ? (
          <div className="min-h-[260px] flex items-center justify-center text-muted-foreground text-sm">
            {filters.length > 0 ? 'No rows match the selected filters.' : 'No state data'}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
              {(
                [
                  ['Assigned', POOL_COLORS.assigned],
                  ['Committed', POOL_COLORS.committed],
                  ['Pending', POOL_COLORS.pending],
                  ['Balance (empty)', '#e2e8f0'],
                ] as const
              ).map(([label, color]) => (
                <div key={label} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span
                    className="size-2.5 shrink-0 rounded-sm border border-border/60"
                    style={{ backgroundColor: color }}
                    aria-hidden
                  />
                  {label}
                </div>
              ))}
            </div>
            <ChartContainer
              config={stateUseConfig}
              className="aspect-auto max-h-none w-full"
              style={{ height: barChartHeight }}
            >
              <BarChart
                accessibilityLayer
                data={stateUseData}
                layout="vertical"
                margin={{ left: 4, right: 88, top: 12, bottom: 8 }}
                barCategoryGap="18%"
              >
                <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                <YAxis
                  dataKey="state"
                  type="category"
                  tickLine={false}
                  axisLine={false}
                  width={118}
                  tickMargin={8}
                  interval={0}
                  tick={{ fontSize: 12 }}
                />
                <XAxis
                  type="number"
                  domain={[0, xMax]}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  tickFormatter={(v) => `${Math.round(Number(v))}%`}
                  tick={{ fontSize: 11 }}
                />
                <ReferenceLine
                  x={100}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  label={{
                    value: '100%',
                    position: 'top',
                    fill: '#64748b',
                    fontSize: 10,
                  }}
                />
                <ChartTooltip
                  cursor={false}
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null
                    const row = payload[0]?.payload as {
                      allocated?: number
                      assigned?: number
                      committed?: number
                      pending?: number
                      assigned_pct?: number
                      committed_pct?: number
                      pending_pct?: number
                      remaining_gap?: number
                      used_pct?: number
                    }
                    if (!row) return null
                    const lines = [
                      {
                        key: 'assigned',
                        label: 'Assigned',
                        color: POOL_COLORS.assigned,
                        pct: row.assigned_pct ?? 0,
                        usd: row.assigned ?? 0,
                      },
                      {
                        key: 'committed',
                        label: 'Committed',
                        color: POOL_COLORS.committed,
                        pct: row.committed_pct ?? 0,
                        usd: row.committed ?? 0,
                      },
                      {
                        key: 'pending',
                        label: 'Pending',
                        color: POOL_COLORS.pending,
                        pct: row.pending_pct ?? 0,
                        usd: row.pending ?? 0,
                      },
                    ]
                    const remainingPct = row.remaining_gap ?? 0
                    return (
                      <div className="rounded-lg border border-border/50 bg-background px-2.5 py-2 text-xs shadow-xl min-w-[10rem]">
                        <div className="font-medium mb-1">{String(label ?? '')}</div>
                        <div className="text-muted-foreground mb-1.5">
                          {money(row.allocated ?? 0)} allocated
                          {row.used_pct != null && row.used_pct > 100
                            ? ` · ${Math.round(row.used_pct)}% used`
                            : ''}
                        </div>
                        <div className="space-y-0.5">
                          {lines.map((line) => (
                            <div key={line.key} className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span
                                  className="size-2 shrink-0 rounded-[2px]"
                                  style={{ backgroundColor: line.color }}
                                />
                                {line.label}
                              </span>
                              <span className="tabular-nums">
                                {line.pct.toFixed(0)}% · {money(line.usd)}
                              </span>
                            </div>
                          ))}
                          {remainingPct > 0 && (
                            <div className="flex items-center justify-between gap-4">
                              <span className="flex items-center gap-1.5 text-muted-foreground">
                                <span className="size-2 shrink-0 rounded-[2px] bg-slate-200" />
                                Balance
                              </span>
                              <span className="tabular-nums">{remainingPct.toFixed(0)}%</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar
                  dataKey="assigned_pct"
                  stackId="use"
                  fill={POOL_COLORS.assigned}
                  barSize={16}
                />
                <Bar
                  dataKey="committed_pct"
                  stackId="use"
                  fill={POOL_COLORS.committed}
                  barSize={16}
                />
                <Bar
                  dataKey="pending_pct"
                  stackId="use"
                  fill={POOL_COLORS.pending}
                  barSize={16}
                >
                  <LabelList
                    content={(props) => {
                      const row =
                        typeof props.index === 'number'
                          ? stateUseData[props.index]
                          : undefined
                      // When overdrawn there is no remaining gap — label from pending end.
                      if (!row || row.remaining_gap > 0) return null
                      return allocatedEndLabel(props)
                    }}
                  />
                </Bar>
                <Bar
                  dataKey="remaining_gap"
                  stackId="use"
                  fill="#e2e8f0"
                  radius={[0, 4, 4, 0]}
                  barSize={16}
                >
                  <LabelList
                    content={(props) => {
                      const row =
                        typeof props.index === 'number'
                          ? stateUseData[props.index]
                          : undefined
                      if (!row || row.remaining_gap <= 0) return null
                      return allocatedEndLabel(props)
                    }}
                  />
                </Bar>
              </BarChart>
            </ChartContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}
