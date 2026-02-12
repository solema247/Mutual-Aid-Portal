'use client'

import { useEffect, useState, useMemo } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'

const STACK_COLORS = {
  sum_transfer_fee_amount: '#7ec8e3',   // sky blue
  sum_activity_amount: '#d4a5d4',       // lavender
  balance: '#9ee6c2',                    // mint
}

type GrantsChartRow = {
  grant_id: string
  total_transferred_amount_usd: number
  sum_transfer_fee_amount: number
  sum_activity_amount: number
  balance: number
}

const chartConfig = {
  sum_transfer_fee_amount: {
    label: 'Transfer fee',
    color: STACK_COLORS.sum_transfer_fee_amount,
  },
  sum_activity_amount: {
    label: 'Activity',
    color: STACK_COLORS.sum_activity_amount,
  },
  balance: {
    label: 'Balance',
    color: STACK_COLORS.balance,
  },
} satisfies ChartConfig

export function GrantsStackedBarChart() {
  const [data, setData] = useState<GrantsChartRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const config = useMemo(() => chartConfig, [])

  useEffect(() => {
    let cancelled = false
    async function fetchData() {
      try {
        const res = await fetch('/api/dashboard/grants-chart')
        if (!res.ok) throw new Error('Failed to load data')
        const json = await res.json()
        if (!cancelled) setData(Array.isArray(json) ? json : [])
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchData()
    return () => { cancelled = true }
  }, [])

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Grants by amount</CardTitle>
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
          <CardTitle>Grants by amount</CardTitle>
          <CardDescription>From grants table</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-destructive">
          {error}
        </CardContent>
      </Card>
    )
  }

  if (!data.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Grants by amount</CardTitle>
          <CardDescription>From grants table</CardDescription>
        </CardHeader>
        <CardContent className="min-h-[200px] flex items-center justify-center text-muted-foreground">
          No data available
        </CardContent>
      </Card>
    )
  }

  const totalTransferred = data.reduce((s, r) => s + r.total_transferred_amount_usd, 0)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Grants by amount</CardTitle>
        <CardDescription>
          Stacked: transfer fee, activity, balance (total transferred − fee − activity).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {(['sum_transfer_fee_amount', 'sum_activity_amount', 'balance'] as const).map((key) => (
            <div key={key} className="flex items-center gap-2">
              <span
                className="size-3 shrink-0 rounded border border-white/50 shadow-sm"
                style={{ backgroundColor: STACK_COLORS[key] }}
                aria-hidden
              />
              <span className="text-sm text-foreground">{chartConfig[key].label}</span>
            </div>
          ))}
        </div>
        <ChartContainer config={config} className="min-h-[280px] w-full">
          <BarChart
            accessibilityLayer
            data={data}
            margin={{ left: 12, right: 12 }}
          >
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="grant_id"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) => (v.length > 10 ? `${v.slice(0, 8)}…` : v)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(v) =>
                v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : String(v)
              }
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
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
            <Bar
              dataKey="sum_transfer_fee_amount"
              stackId="a"
              fill={STACK_COLORS.sum_transfer_fee_amount}
              radius={[0, 0, 4, 4]}
            />
            <Bar
              dataKey="sum_activity_amount"
              stackId="a"
              fill={STACK_COLORS.sum_activity_amount}
              radius={0}
            />
            <Bar
              dataKey="balance"
              stackId="a"
              fill={STACK_COLORS.balance}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
      <CardFooter className="flex-col items-start gap-2 text-sm">
        <div className="text-muted-foreground leading-none">
          Total transferred (all grants): {totalTransferred.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })}
        </div>
      </CardFooter>
    </Card>
  )
}
