'use client'

import { useCallback, useEffect, useState, useMemo } from 'react'
import { Download } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
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
  type ChartConfig,
} from '@/components/ui/chart'

const AMOUNT_COLORS = {
  sum_transfer_fee_amount: '#7ec8e3',
  sum_activity_amount: '#d4a5d4',
  balance: '#9ee6c2',
} as const

const PERCENT_COLORS = {
  sum_activity_amount_pct: '#d4a5d4',
  sum_transfer_fee_amount_pct: '#7ec8e3',
  sum_disbursed_to_errs_pct: '#f2c14e',
  payout_balance_pct: '#9ee6c2',
} as const

type GrantsChartRow = {
  grant_id: string
  total_transferred_amount_usd: number
  sum_transfer_fee_amount: number
  sum_activity_amount: number
  sum_disbursed_to_errs?: number
  balance: number
  payout_balance?: number
}

type ChartDisplayRow = GrantsChartRow & {
  sum_disbursed_to_errs: number
  payout_balance: number
  sum_activity_amount_pct: number
  sum_transfer_fee_amount_pct: number
  sum_disbursed_to_errs_pct: number
  payout_balance_pct: number
}

interface GrantsStackedBarChartProps {
  dateFrom?: string
  dateTo?: string
  /** `horizontal` = one bar per grant row (left→right). Default `vertical` for dashboard. */
  orientation?: 'horizontal' | 'vertical'
  /** `percent` = 100% stacked composition. Default `amount` for dashboard. */
  stackMode?: 'amount' | 'percent'
}

const amountChartConfig = {
  sum_transfer_fee_amount: { label: 'Transfer fee', color: AMOUNT_COLORS.sum_transfer_fee_amount },
  sum_activity_amount: { label: 'Activity', color: AMOUNT_COLORS.sum_activity_amount },
  balance: { label: 'Balance', color: AMOUNT_COLORS.balance },
} satisfies ChartConfig

const percentChartConfig = {
  sum_activity_amount_pct: { label: 'Transfer segments', color: PERCENT_COLORS.sum_activity_amount_pct },
  sum_transfer_fee_amount_pct: { label: 'Transfer fees', color: PERCENT_COLORS.sum_transfer_fee_amount_pct },
  sum_disbursed_to_errs_pct: { label: 'Disbursed to ERRs', color: PERCENT_COLORS.sum_disbursed_to_errs_pct },
  payout_balance_pct: { label: 'Balance', color: PERCENT_COLORS.payout_balance_pct },
} satisfies ChartConfig

const AMOUNT_STACK_KEYS = ['sum_transfer_fee_amount', 'sum_activity_amount', 'balance'] as const
const TRANSFER_STACK_KEYS = ['sum_activity_amount_pct', 'sum_transfer_fee_amount_pct'] as const
const PAYOUT_STACK_KEYS = ['sum_disbursed_to_errs_pct', 'payout_balance_pct'] as const
const PERCENT_STACK_KEYS = [...TRANSFER_STACK_KEYS, ...PAYOUT_STACK_KEYS] as const

const moneyTick = (v: number) =>
  v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)

const percentTick = (v: number) => `${Math.round(v)}%`

const moneyLabel = (value: number) =>
  Number(value).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  })

const compactMoney = (value: number) => {
  const n = Number(value) || 0
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`
  return `${sign}$${Math.round(abs)}`
}

const USD_BY_PCT_KEY: Record<string, keyof ChartDisplayRow> = {
  sum_activity_amount_pct: 'sum_activity_amount',
  sum_transfer_fee_amount_pct: 'sum_transfer_fee_amount',
  sum_disbursed_to_errs_pct: 'sum_disbursed_to_errs',
  payout_balance_pct: 'payout_balance',
}

export function GrantsStackedBarChart({
  dateFrom,
  dateTo,
  orientation = 'vertical',
  stackMode = 'amount',
}: GrantsStackedBarChartProps) {
  const [data, setData] = useState<GrantsChartRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const percent = stackMode === 'percent'
  const config: ChartConfig = useMemo(
    () => (percent ? percentChartConfig : amountChartConfig),
    [percent]
  )
  const colors = percent ? PERCENT_COLORS : AMOUNT_COLORS
  const stackKeys = percent ? PERCENT_STACK_KEYS : AMOUNT_STACK_KEYS
  const horizontal = orientation === 'horizontal'

  const displayData: ChartDisplayRow[] = useMemo(
    () =>
      data.map((row) => {
        const total = Number(row.total_transferred_amount_usd) || 0
        const activity = Number(row.sum_activity_amount) || 0
        const fee = Number(row.sum_transfer_fee_amount) || 0
        const disbursed = Number(row.sum_disbursed_to_errs) || 0
        const remaining = Math.max(0, total - disbursed)
        const toPct = (n: number) => (total > 0 ? (n / total) * 100 : 0)
        return {
          ...row,
          sum_activity_amount: activity,
          sum_transfer_fee_amount: fee,
          sum_disbursed_to_errs: disbursed,
          payout_balance: remaining,
          sum_activity_amount_pct: toPct(activity),
          sum_transfer_fee_amount_pct: toPct(fee),
          sum_disbursed_to_errs_pct: toPct(disbursed),
          payout_balance_pct: toPct(remaining),
        }
      }),
    [data]
  )

  const handleDownloadCsv = useCallback(() => {
    const headers: [keyof ChartDisplayRow, string][] = percent
      ? [
          ['grant_id', 'Grant ID'],
          ['total_transferred_amount_usd', 'Total transferred (USD)'],
          ['sum_activity_amount', 'Transfer segments'],
          ['sum_transfer_fee_amount', 'Transfer fees'],
          ['sum_disbursed_to_errs', 'Disbursed to ERRs'],
          ['payout_balance', 'Balance'],
        ]
      : [
          ['grant_id', 'Grant ID'],
          ['total_transferred_amount_usd', 'Total transferred (USD)'],
          ['sum_transfer_fee_amount', 'Transfer fee'],
          ['sum_activity_amount', 'Activity'],
          ['balance', 'Balance'],
        ]
    const csv = buildCsv(displayData, { headers })
    downloadCsv(csv, 'grants-by-amount.csv')
  }, [displayData, percent])

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        setLoading(true)
        const params = new URLSearchParams()
        if (dateFrom) params.set('from', dateFrom)
        if (dateTo) params.set('to', dateTo)
        const qs = params.toString()
        const url = qs ? `/api/dashboard/grants-chart?${qs}` : '/api/dashboard/grants-chart'
        const res = await fetch(url)
        if (!res.ok) throw new Error('Failed to load data')
        const json = await res.json()
        if (!cancelled) {
          setData(Array.isArray(json) ? json : [])
          setError(null)
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

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Grants by Amount</CardTitle>
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
          <CardTitle>Grants by Amount</CardTitle>
          <CardDescription>From grants_grid_view</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!displayData.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Grants by Amount</CardTitle>
          <CardDescription>From grants_grid_view</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    )
  }

  const totalTransferred = displayData.reduce((s, r) => s + r.total_transferred_amount_usd, 0)
  const overDisbursedCount = displayData.filter(
    (r) => r.sum_disbursed_to_errs > r.total_transferred_amount_usd + 0.5
  ).length
  const maxPct = displayData.reduce(
    (m, r) =>
      Math.max(
        m,
        r.sum_activity_amount_pct + r.sum_transfer_fee_amount_pct,
        r.sum_disbursed_to_errs_pct + r.payout_balance_pct
      ),
    0
  )
  const xMax = Math.max(100, Math.ceil(maxPct / 10) * 10)
  const maxLabelLen = displayData.reduce((m, r) => Math.max(m, String(r.grant_id).length), 0)
  const yAxisWidth = horizontal
    ? Math.min(280, Math.max(72, Math.ceil(maxLabelLen * 7.2) + 12))
    : undefined
  const barChartHeight = horizontal
    ? Math.max(240, displayData.length * (percent ? 52 : 28))
    : undefined

  const endTotalLabel = (props: {
    x?: string | number
    y?: string | number
    width?: string | number
    height?: string | number
    index?: number
  }) => {
    const { x = 0, y = 0, width = 0, height = 0, index } = props
    const row = typeof index === 'number' ? displayData[index] : undefined
    if (!row) return null
    if (horizontal) {
      return (
        <text
          x={Number(x) + Number(width) + 8}
          y={Number(y) + Number(height) / 2}
          dominantBaseline="middle"
          className="fill-foreground"
          style={{ fontSize: 11, fontWeight: 600 }}
        >
          {moneyLabel(row.total_transferred_amount_usd)}
        </text>
      )
    }
    return (
      <text
        x={Number(x) + Number(width) / 2}
        y={Number(y) - 6}
        textAnchor="middle"
        className="fill-foreground"
        style={{ fontSize: 10, fontWeight: 600 }}
      >
        {moneyLabel(row.total_transferred_amount_usd)}
      </text>
    )
  }

  const stackRadius = (index: number, lastIndex: number) => {
    const isFirst = index === 0
    const isLast = index === lastIndex
    if (horizontal) {
      return isFirst
        ? ([4, 0, 0, 4] as [number, number, number, number])
        : isLast
          ? ([0, 4, 4, 0] as [number, number, number, number])
          : 0
    }
    return isFirst
      ? ([0, 0, 4, 4] as [number, number, number, number])
      : isLast
        ? ([4, 4, 0, 0] as [number, number, number, number])
        : 0
  }

  const segmentLabel = (
    props: {
      x?: string | number
      y?: string | number
      width?: string | number
      height?: string | number
      index?: number
    },
    key: string
  ) => {
    const { x = 0, y = 0, width = 0, height = 0, index } = props
    const w = Number(width)
    const h = Number(height)
    const minSide = horizontal ? w : h
    if (minSide < 22) return null
    const row = typeof index === 'number' ? displayData[index] : undefined
    if (!row) return null
    const usd = percent
      ? Number(row[USD_BY_PCT_KEY[key]]) || 0
      : Number(row[key as keyof ChartDisplayRow]) || 0
    if (usd <= 0) return null
    const text = compactMoney(usd)
    const charW = 6.4
    if (text.length * charW + 8 > minSide) return null
    return (
      <text
        x={Number(x) + w / 2}
        y={Number(y) + h / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#1e293b"
        style={{ fontSize: 10, fontWeight: 600, pointerEvents: 'none' }}
      >
        {text}
      </text>
    )
  }

  const makeBars = (keys: readonly string[], stackId: string, showEndLabel: boolean) =>
    keys.map((key, i) => (
      <Bar
        key={`${stackId}-${key}`}
        dataKey={key}
        stackId={stackId}
        fill={colors[key as keyof typeof colors]}
        radius={stackRadius(i, keys.length - 1)}
        barSize={percent && horizontal ? 20 : undefined}
      >
        <LabelList content={(props) => segmentLabel(props, key)} />
        {showEndLabel ? (
          <LabelList
            content={(props) => {
              const row = typeof props.index === 'number' ? displayData[props.index] : undefined
              if (!row) return null
              const lastVisible = [...keys].reverse().find((k) => Number(row[k as keyof ChartDisplayRow]) > 0)
              if (lastVisible !== key) return null
              return endTotalLabel(props)
            }}
          />
        ) : null}
      </Bar>
    ))

  const bars = percent
    ? [...makeBars(TRANSFER_STACK_KEYS, 'transfer', false), ...makeBars(PAYOUT_STACK_KEYS, 'payout', true)]
    : makeBars(AMOUNT_STACK_KEYS, 'a', true)

  const tooltip = (
    <ChartTooltip
      content={({ active, payload }) => {
        if (!active || !payload?.length) return null
        const row = payload[0]?.payload as ChartDisplayRow | undefined
        if (!row) return null
        const items = payload.filter((item) => Number(item.value) > 0)
        if (!items.length) return null
        const overBy = row.sum_disbursed_to_errs - row.total_transferred_amount_usd
        const usdForPctKey: Record<string, number> = {
          sum_activity_amount_pct: row.sum_activity_amount,
          sum_transfer_fee_amount_pct: row.sum_transfer_fee_amount,
          sum_disbursed_to_errs_pct: row.sum_disbursed_to_errs,
          payout_balance_pct: row.payout_balance,
        }
        return (
          <div className="grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
            <div className="font-medium text-foreground">{row.grant_id}</div>
            {items.map((item) => {
              const key = String(item.dataKey ?? '')
              const label = config[key]?.label ?? key
              const usd = percent ? usdForPctKey[key] ?? 0 : Number(item.value) || 0
              const pct = percent ? Number(item.value) || 0 : null
              return (
                <div key={key} className="flex items-center justify-between gap-4">
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <span
                      className="size-2 shrink-0 rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                    {label}
                  </span>
                  <span className="font-mono font-medium text-foreground">
                    {moneyLabel(usd)}
                    {pct != null ? ` (${Math.round(pct)}%)` : ''}
                  </span>
                </div>
              )
            })}
            {overBy > 0.5 ? (
              <div className="text-destructive">Over disbursed by {moneyLabel(overBy)}</div>
            ) : null}
          </div>
        )
      }}
    />
  )

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0">
        <div className="space-y-1.5">
          <CardTitle>Grants by Amount</CardTitle>
          <CardDescription>
            {percent
              ? 'Share of transferred USD. The dashed line is 100%. Paid-out bars past that line are over-disbursed.'
              : 'Stacked: transfer fee, activity, balance (total transferred − fee − activity).'}
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
        {percent ? (
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs font-medium text-muted-foreground">Transfer</span>
              {TRANSFER_STACK_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded border border-white/50 shadow-sm"
                    style={{ backgroundColor: PERCENT_COLORS[key] }}
                    aria-hidden
                  />
                  <span className="text-sm text-foreground">{percentChartConfig[key].label}</span>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-xs font-medium text-muted-foreground">Paid out</span>
              {PAYOUT_STACK_KEYS.map((key) => (
                <div key={key} className="flex items-center gap-2">
                  <span
                    className="size-3 shrink-0 rounded border border-white/50 shadow-sm"
                    style={{ backgroundColor: PERCENT_COLORS[key] }}
                    aria-hidden
                  />
                  <span className="text-sm text-foreground">{percentChartConfig[key].label}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {stackKeys.map((key) => (
              <div key={key} className="flex items-center gap-2">
                <span
                  className="size-3 shrink-0 rounded border border-white/50 shadow-sm"
                  style={{ backgroundColor: colors[key as keyof typeof colors] }}
                  aria-hidden
                />
                <span className="text-sm text-foreground">{config[key].label}</span>
              </div>
            ))}
          </div>
        )}
        <ChartContainer
          config={config}
          className={horizontal ? 'aspect-auto max-h-none w-full' : 'min-h-[280px] w-full'}
          style={horizontal ? { height: barChartHeight } : undefined}
        >
          {horizontal ? (
            <BarChart
              accessibilityLayer
              data={displayData}
              layout="vertical"
              margin={{ left: 4, right: xMax > 100 ? 88 : 72, top: percent ? 16 : 4, bottom: 4 }}
              barCategoryGap={percent ? '28%' : 4}
              barGap={0}
            >
              <CartesianGrid horizontal={false} strokeDasharray="3 3" />
              <YAxis
                dataKey="grant_id"
                type="category"
                tickLine={false}
                axisLine={false}
                width={yAxisWidth}
                tickMargin={6}
                interval={0}
                tick={{ fontSize: 11, fontWeight: 700 }}
              />
              <XAxis
                type="number"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                domain={percent ? [0, xMax] : undefined}
                tickFormatter={percent ? percentTick : moneyTick}
                tick={{ fontSize: 11 }}
              />
              {percent ? (
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
              ) : null}
              {tooltip}
              {bars}
            </BarChart>
          ) : (
            <BarChart
              accessibilityLayer
              data={displayData}
              margin={{ left: 12, right: 12, top: percent ? 20 : 20 }}
            >
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="grant_id"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                tickFormatter={(v) => (v.length > 10 ? `${v.slice(0, 8)}…` : v)}
                tick={{ fontWeight: 700 }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                domain={percent ? [0, xMax] : undefined}
                tickFormatter={percent ? percentTick : moneyTick}
              />
              {percent ? (
                <ReferenceLine
                  y={100}
                  stroke="#64748b"
                  strokeDasharray="4 4"
                  label={{
                    value: '100%',
                    position: 'right',
                    fill: '#64748b',
                    fontSize: 10,
                  }}
                />
              ) : null}
              {tooltip}
              {bars}
            </BarChart>
          )}
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="text-muted-foreground leading-none">
          Total transferred (all grants):{' '}
          {totalTransferred.toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD',
            maximumFractionDigits: 0,
          })}
          {percent && overDisbursedCount > 0
            ? ` · ${overDisbursedCount} over 100% disbursed`
            : ''}
        </div>
      </CardFooter>
    </Card>
  )
}
