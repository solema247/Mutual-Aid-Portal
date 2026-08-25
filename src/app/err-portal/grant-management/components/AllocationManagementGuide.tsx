'use client'

import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { poolByStateRows } from '@/lib/poolByState'

const NOTE_STYLES = [
  'bg-sky-50 border-sky-100',
  'bg-emerald-50 border-emerald-100',
  'bg-amber-50 border-amber-100',
] as const

const REMAINING_COLOR = '#e2e8f0'
const ASSIGNED_COLOR = '#7ec8e3'
const COMMITTED_COLOR = '#9ee6c2'
const PENDING_COLOR = '#ffc9a4'
const DISBURSED_COLOR = '#f2c14e'

type StateRow = {
  state_name: string
  remaining?: number
  balance?: number
  allocated?: number
  assigned?: number
  available?: number
  committed?: number
  pending?: number
}

type GrantRow = {
  grant_id: string
  balance?: number
  payout_balance?: number
  total_transferred_amount_usd: number
  sum_disbursed_to_errs?: number
}

type RestrictionRow = {
  restriction: string
  allocated?: number
  assigned?: number
  available?: number
  committed?: number
  pending?: number
}

type FspRow = {
  id: string
  name: string
  treasury_in_usd?: number | null
  treasury_out_usd?: number | null
  balance?: number
}

type PctBarRow = {
  id: string
  label: string
  capacity: number
  availableUsd?: number
  remainingUsd: number
  usedA: number
  usedB: number
  usedC: number
  remaining: number
  usedAUsd: number
  usedBUsd: number
  usedCUsd: number
}

const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)

const compactMoney = (value: number) => {
  const n = Number(value) || 0
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`
  if (abs >= 1e3) return `${sign}$${Math.round(abs / 1e3)}k`
  return `${sign}$${Math.round(abs)}`
}

function wrapAxisLabel(label: string, maxChars: number): string[] {
  const text = String(label ?? '').trim()
  if (!text) return ['']
  if (text.length <= maxChars) return [text]
  const lines: string[] = []
  let rest = text
  while (rest.length > maxChars && lines.length < 2) {
    let breakAt = rest.lastIndexOf(' ', maxChars)
    if (breakAt < maxChars / 3) breakAt = rest.lastIndexOf('-', maxChars)
    if (breakAt < maxChars / 3) breakAt = maxChars
    lines.push(rest.slice(0, breakAt).trim())
    rest = rest.slice(breakAt).replace(/^-/, '').trim()
  }
  if (lines.length >= 2 && rest) {
    const last = lines[1]
    lines[1] = last.length >= maxChars ? `${last.slice(0, maxChars - 1)}…` : `${last}…`
    return lines
  }
  if (rest) lines.push(rest)
  return lines
}

function signedMoney(n: number, direction: 'in' | 'out') {
  const formatted = money(Math.abs(n))
  if (direction === 'out') return `−${formatted}`
  return `+${formatted}`
}

function TreasuryMetricCard({
  title,
  badge,
  balanceLabel,
  balance,
  inLabel,
  outLabel,
  inn,
  out,
}: {
  title: string
  badge: string
  balanceLabel: string
  balance: number
  inLabel: string
  outLabel: string
  inn: number
  out: number
}) {
  return (
    <div className="rounded-none border-0 bg-card pl-3 pr-3 py-2.5 shadow-md">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="text-sm font-bold leading-tight truncate" title={title}>
          {title}
        </div>
        <Badge
          variant="secondary"
          className="shrink-0 h-5 bg-sky-100 text-sky-800 border-0 text-[10px] px-1.5"
        >
          {badge}
        </Badge>
      </div>
      <div className="text-[10px] text-muted-foreground">{balanceLabel}</div>
      <div
        className={`text-xl font-bold tabular-nums ${
          balance >= 0 ? 'text-foreground' : 'text-red-700'
        }`}
      >
        {money(balance)}
      </div>
      <div className="border-t border-dashed border-border mt-2 pt-2 space-y-1 text-[11px]">
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{inLabel}</span>
          <span className="tabular-nums font-medium text-green-700">{signedMoney(inn, 'in')}</span>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-muted-foreground">{outLabel}</span>
          <span className="tabular-nums font-medium text-red-700">{signedMoney(out, 'out')}</span>
        </div>
      </div>
    </div>
  )
}

function FspTreasuryCards({ fsps }: { fsps: FspRow[] }) {
  const { t } = useTranslation(['err'])
  const cards = [...fsps]
    .map((f) => {
      const inn = Number(f.treasury_in_usd) || 0
      const out = Number(f.treasury_out_usd) || 0
      return {
        id: f.id,
        name: String(f.name ?? '').trim() || 'Unnamed FSP',
        inn,
        out,
        balance: f.balance != null ? Number(f.balance) : inn - out,
      }
    })
    .sort((a, b) => b.balance - a.balance)
  const totalIn = cards.reduce((s, c) => s + c.inn, 0)
  const totalOut = cards.reduce((s, c) => s + c.out, 0)
  const totalBal = totalIn - totalOut

  return (
    <div className="space-y-2">
      <div>
        <h4 className="text-lg font-semibold">
          {t('err:allocation_guide_treasuries_title')}
        </h4>
        <p className="text-[10px] text-muted-foreground">
          {t('err:allocation_guide_treasuries_hint')}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map((c) => (
          <TreasuryMetricCard
            key={c.id}
            title={c.name}
            badge={t('err:allocation_guide_treasury_badge')}
            balanceLabel={t('err:allocation_guide_treasury_balance')}
            balance={c.balance}
            inLabel={t('err:allocation_guide_treasury_in')}
            outLabel={t('err:allocation_guide_treasury_out')}
            inn={c.inn}
            out={c.out}
          />
        ))}
        <TreasuryMetricCard
          title={t('err:allocation_guide_treasury_grand_total')}
          badge={t('err:allocation_guide_treasury_all')}
          balanceLabel={t('err:allocation_guide_treasury_total_balance')}
          balance={totalBal}
          inLabel={t('err:allocation_guide_treasury_total_in')}
          outLabel={t('err:allocation_guide_treasury_total_out')}
          inn={totalIn}
          out={totalOut}
        />
      </div>
    </div>
  )
}

function toPctRow(args: {
  id: string
  label: string
  capacity: number
  usedAUsd: number
  usedBUsd?: number
  usedCUsd?: number
  availableUsd?: number
  remainingUsd?: number
  keepEmpty?: boolean
}): PctBarRow | null {
  const usedAUsd = Number(args.usedAUsd) || 0
  const usedBUsd = Number(args.usedBUsd) || 0
  const usedCUsd = Number(args.usedCUsd) || 0
  const used = usedAUsd + usedBUsd + usedCUsd
  const capacity = Number(args.capacity) || 0
  if (capacity <= 0 && used <= 0 && !args.keepEmpty) return null
  const toPct = (n: number) => {
    if (capacity > 0) return (n / capacity) * 100
    if (used > 0) return (n / used) * 100
    return 0
  }
  const availableUsd =
    args.availableUsd != null ? Number(args.availableUsd) : undefined
  const remainingUsd =
    args.remainingUsd != null
      ? Number(args.remainingUsd)
      : availableUsd != null
        ? availableUsd - usedBUsd - usedCUsd
        : capacity - used
  return {
    id: args.id,
    label: args.label,
    capacity,
    availableUsd,
    remainingUsd,
    usedAUsd,
    usedBUsd,
    usedCUsd,
    usedA: toPct(usedAUsd),
    usedB: toPct(usedBUsd),
    usedC: toPct(usedCUsd),
    remaining: capacity > 0 ? toPct(Math.max(0, remainingUsd)) : used > 0 ? 0 : 100,
  }
}

function BalancePctChart({
  rows,
  empty,
  capacityLabel = 'Capacity',
  usedALabel,
  usedAColor,
  usedBLabel,
  usedBColor,
  usedCLabel,
  usedCColor,
  overLabel = 'Overdrawn by',
  expanded = false,
  rowHeight = 36,
  barCategoryGap = 10,
}: {
  rows: PctBarRow[]
  empty: string
  capacityLabel?: string
  usedALabel: string
  usedAColor: string
  usedBLabel?: string
  usedBColor?: string
  usedCLabel?: string
  usedCColor?: string
  overLabel?: string
  expanded?: boolean
  rowHeight?: number
  barCategoryGap?: number | string
}) {
  const showUsedB = Boolean(usedBLabel && usedBColor)
  const showUsedC = Boolean(usedCLabel && usedCColor)
  const config = {
    usedA: { label: usedALabel, color: usedAColor },
    usedB: { label: usedBLabel ?? 'Used', color: usedBColor ?? usedAColor },
    usedC: { label: usedCLabel ?? 'Used', color: usedCColor ?? usedAColor },
    remaining: { label: 'Remaining', color: REMAINING_COLOR },
  } satisfies ChartConfig

  const chartRows = useMemo(() => {
    if (!rows.length) return []
    const hasAvailable = rows.some((r) => r.availableUsd != null)
    const total = toPctRow({
      id: '__total__',
      label: 'Total',
      capacity: rows.reduce((s, r) => s + r.capacity, 0),
      usedAUsd: rows.reduce((s, r) => s + r.usedAUsd, 0),
      usedBUsd: rows.reduce((s, r) => s + r.usedBUsd, 0),
      usedCUsd: rows.reduce((s, r) => s + r.usedCUsd, 0),
      availableUsd: hasAvailable
        ? rows.reduce((s, r) => s + (Number(r.availableUsd) || 0), 0)
        : undefined,
      remainingUsd: rows.reduce((s, r) => s + r.remainingUsd, 0),
    })
    return total ? [total, ...rows] : rows
  }, [rows])

  const xMax = useMemo(() => {
    const maxUsed = chartRows.reduce((m, r) => Math.max(m, r.usedA + r.usedB + r.usedC), 0)
    return Math.max(100, Math.ceil(maxUsed / 10) * 10)
  }, [chartRows])

  const maxLabelLen = chartRows.reduce((m, r) => Math.max(m, r.label.length), 0)
  const yAxisWidth = Math.min(184, Math.max(88, Math.ceil(Math.min(maxLabelLen, 22) * 6.6) + 12))
  const maxChars = Math.max(12, Math.floor((yAxisWidth - 10) / 6.2))
  const height = Math.max(120, chartRows.length * rowHeight)

  if (!chartRows.length) {
    return <p className="text-[10px] text-muted-foreground">{empty}</p>
  }

  const insideLabel = (
    props: {
      x?: string | number
      y?: string | number
      width?: string | number
      height?: string | number
      index?: number
    },
    usdKey: 'usedAUsd' | 'usedBUsd' | 'usedCUsd'
  ) => {
    const { x = 0, y = 0, width = 0, height: h = 0, index } = props
    const w = Number(width)
    if (w < 28) return null
    const row = typeof index === 'number' ? chartRows[index] : undefined
    if (!row) return null
    const usd = row[usdKey]
    if (usd <= 0) return null
    const text = compactMoney(usd)
    if (text.length * 6.4 + 8 > w) return null
    return (
      <text
        x={Number(x) + w / 2}
        y={Number(y) + Number(h) / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="#1e293b"
        style={{ fontSize: 9, fontWeight: 600, pointerEvents: 'none' }}
      >
        {text}
      </text>
    )
  }

  const endLabel = (props: {
    x?: string | number
    y?: string | number
    width?: string | number
    height?: string | number
    index?: number
  }) => {
    const { x = 0, y = 0, width = 0, height: h = 0, index } = props
    const row = typeof index === 'number' ? chartRows[index] : undefined
    if (!row) return null
    return (
      <text
        x={Number(x) + Number(width) + 6}
        y={Number(y) + Number(h) / 2}
        dominantBaseline="middle"
        className={row.remainingUsd < 0 ? 'fill-red-700' : 'fill-foreground'}
        style={{ fontSize: 10, fontWeight: 600 }}
      >
        {money(row.remainingUsd)}
      </text>
    )
  }

  const lastVisibleKey = (row: PctBarRow) => {
    if (row.remaining > 0) return 'remaining'
    if (showUsedC && row.usedC > 0) return 'usedC'
    if (showUsedB && row.usedB > 0) return 'usedB'
    return 'usedA'
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="size-2 rounded-[2px]" style={{ backgroundColor: usedAColor }} />
          {usedALabel}
        </span>
        {showUsedB ? (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: usedBColor }} />
            {usedBLabel}
          </span>
        ) : null}
        {showUsedC ? (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="size-2 rounded-[2px]" style={{ backgroundColor: usedCColor }} />
            {usedCLabel}
          </span>
        ) : null}
        <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="size-2 rounded-[2px] border border-border/60" style={{ backgroundColor: REMAINING_COLOR }} />
          Remaining
        </span>
      </div>
      <div className={expanded ? undefined : 'max-h-[360px] overflow-y-auto'}>
        <ChartContainer
          config={config}
          className="aspect-auto max-h-none w-full overflow-visible [&_.recharts-wrapper]:overflow-visible [&_.recharts-surface]:overflow-visible"
          style={{ height }}
        >
          <BarChart
            accessibilityLayer
            data={chartRows}
            layout="vertical"
            margin={{ left: 8, right: 72, top: 14, bottom: 4 }}
            barCategoryGap={barCategoryGap}
          >
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <YAxis
              dataKey="id"
              type="category"
              tickLine={false}
              axisLine={false}
              width={yAxisWidth}
              tickMargin={6}
              interval={0}
              tick={({ x, y, payload }) => {
                const row = chartRows.find((r) => r.id === payload.value)
                const label = row?.label ?? String(payload.value ?? '')
                const isTotal = row?.id === '__total__'
                const lines = wrapAxisLabel(label, maxChars)
                const lineH = 10
                const startY = Number(y) - ((lines.length - 1) * lineH) / 2
                return (
                  <text
                    x={x}
                    y={startY}
                    textAnchor="end"
                    dominantBaseline="middle"
                    className="fill-foreground"
                    style={{ fontSize: 10, fontWeight: isTotal ? 800 : 700 }}
                  >
                    {lines.map((line, i) => (
                      <tspan key={i} x={Number(x)} dy={i === 0 ? 0 : lineH}>
                        {line}
                      </tspan>
                    ))}
                  </text>
                )
              }}
            />
            <XAxis
              type="number"
              domain={[0, xMax]}
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickFormatter={(v) => `${Math.round(Number(v))}%`}
              tick={{ fontSize: 9 }}
            />
            <ReferenceLine
              x={100}
              stroke="#64748b"
              strokeDasharray="4 4"
              label={{ value: '100%', position: 'top', fill: '#64748b', fontSize: 9 }}
            />
            <ChartTooltip
              cursor={false}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as PctBarRow | undefined
                if (!row) return null
                const over = row.remainingUsd < 0
                const signedClass = (n: number) =>
                  n >= 0 ? 'text-green-700' : 'text-red-700'
                return (
                  <div className="grid min-w-[8rem] gap-1 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-[10px] shadow-xl">
                    <div className="font-medium">{row.label}</div>
                    <div className="flex justify-between gap-3">
                      <span>{capacityLabel}</span>
                      <span className="tabular-nums">{money(row.capacity)}</span>
                    </div>
                    <div className="flex justify-between gap-3">
                      <span>{usedALabel}</span>
                      <span className="tabular-nums">{money(row.usedAUsd)}</span>
                    </div>
                    {row.availableUsd != null ? (
                      <div
                        className={`flex justify-between gap-3 border-y border-border py-1 font-semibold ${signedClass(row.availableUsd)}`}
                      >
                        <span>Available</span>
                        <span className="tabular-nums">{money(row.availableUsd)}</span>
                      </div>
                    ) : null}
                    {showUsedB ? (
                      <div className="flex justify-between gap-3">
                        <span>{usedBLabel}</span>
                        <span className="tabular-nums">{money(row.usedBUsd)}</span>
                      </div>
                    ) : null}
                    {showUsedC ? (
                      <div className="flex justify-between gap-3">
                        <span>{usedCLabel}</span>
                        <span className="tabular-nums">{money(row.usedCUsd)}</span>
                      </div>
                    ) : null}
                    <div
                      className={`flex justify-between gap-3 border-y border-border py-1 font-semibold ${signedClass(row.remainingUsd)}`}
                    >
                      <span>Remaining</span>
                      <span className="tabular-nums">{money(row.remainingUsd)}</span>
                    </div>
                    {over ? (
                      <div className="text-red-700">
                        {overLabel} {money(-row.remainingUsd)}
                      </div>
                    ) : null}
                  </div>
                )
              }}
            />
            <Bar
              dataKey="usedA"
              stackId="use"
              fill={usedAColor}
              barSize={14}
              radius={showUsedB ? [4, 0, 0, 4] : [4, 0, 0, 4]}
            >
              <LabelList content={(props) => insideLabel(props, 'usedAUsd')} />
              <LabelList
                content={(props) => {
                  const row = typeof props.index === 'number' ? chartRows[props.index] : undefined
                  if (!row || lastVisibleKey(row) !== 'usedA') return null
                  return endLabel(props)
                }}
              />
            </Bar>
            {showUsedB ? (
              <Bar dataKey="usedB" stackId="use" fill={usedBColor} barSize={14}>
                <LabelList content={(props) => insideLabel(props, 'usedBUsd')} />
                <LabelList
                  content={(props) => {
                    const row = typeof props.index === 'number' ? chartRows[props.index] : undefined
                    if (!row || lastVisibleKey(row) !== 'usedB') return null
                    return endLabel(props)
                  }}
                />
              </Bar>
            ) : null}
            {showUsedC ? (
              <Bar dataKey="usedC" stackId="use" fill={usedCColor} barSize={14}>
                <LabelList content={(props) => insideLabel(props, 'usedCUsd')} />
                <LabelList
                  content={(props) => {
                    const row = typeof props.index === 'number' ? chartRows[props.index] : undefined
                    if (!row || lastVisibleKey(row) !== 'usedC') return null
                    return endLabel(props)
                  }}
                />
              </Bar>
            ) : null}
            <Bar
              dataKey="remaining"
              stackId="use"
              fill={REMAINING_COLOR}
              barSize={14}
              radius={[0, 4, 4, 0]}
            >
              <LabelList
                content={(props) => {
                  const row = typeof props.index === 'number' ? chartRows[props.index] : undefined
                  if (!row || lastVisibleKey(row) !== 'remaining') return null
                  return endLabel(props)
                }}
              />
            </Bar>
          </BarChart>
        </ChartContainer>
      </div>
    </div>
  )
}

export default function AllocationManagementGuide() {
  const { t } = useTranslation(['err'])
  const [chartsExpanded, setChartsExpanded] = useState(false)
  const [states, setStates] = useState<StateRow[]>([])
  const [grants, setGrants] = useState<GrantRow[]>([])
  const [fsps, setFsps] = useState<FspRow[]>([])
  const [restrictions, setRestrictions] = useState<RestrictionRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        const [sRes, gRes, fRes, rRes] = await Promise.all([
          fetch('/api/pool/by-state', { cache: 'no-store' }),
          fetch('/api/dashboard/grants-chart', { cache: 'no-store' }),
          fetch('/api/fsps', { cache: 'no-store' }),
          fetch('/api/pool/by-restriction', { cache: 'no-store' }),
        ])
        const [s, g, f, r] = await Promise.all([
          sRes.ok ? sRes.json() : [],
          gRes.ok ? gRes.json() : [],
          fRes.ok ? fRes.json() : [],
          rRes.ok ? rRes.json() : [],
        ])
        if (cancelled) return
        setStates(poolByStateRows(s))
        setGrants(Array.isArray(g) ? g : [])
        setFsps(Array.isArray(f) ? f : [])
        setRestrictions(Array.isArray(r) ? r : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [])

  const notes = [
    {
      title: t('err:allocation_guide_section_pool'),
      body: t('err:allocation_guide_pool_body'),
    },
    {
      title: t('err:allocation_guide_section_grants'),
      body: t('err:allocation_guide_grants_body'),
    },
    {
      title: t('err:allocation_guide_section_fr'),
      body: t('err:allocation_guide_fr_body'),
    },
  ]

  const stateRows = useMemo(
    () =>
      [...states]
        .map((r) => {
          if ((Number(r.allocated) || 0) <= 0) return null
          const allocated = Number(r.allocated) || 0
          const assigned = Number(r.assigned) || 0
          const committed = Number(r.committed) || 0
          const pending = Number(r.pending) || 0
          const available =
            r.available != null ? Number(r.available) : allocated - assigned
          return toPctRow({
            id: r.state_name,
            label: r.state_name,
            capacity: allocated,
            usedAUsd: assigned,
            usedBUsd: committed,
            usedCUsd: pending,
            availableUsd: available,
            remainingUsd: available - committed - pending,
          })
        })
        .filter((r): r is PctBarRow => r != null)
        .sort((a, b) => b.remainingUsd - a.remainingUsd),
    [states]
  )

  const grantRows = useMemo(
    () =>
      [...grants]
        .map((r) =>
          toPctRow({
            id: r.grant_id,
            label: r.grant_id,
            capacity: Number(r.total_transferred_amount_usd) || 0,
            usedAUsd: Number(r.sum_disbursed_to_errs) || 0,
          })
        )
        .filter((r): r is PctBarRow => r != null)
        .sort((a, b) => b.remainingUsd - a.remainingUsd),
    [grants]
  )

  const restrictionRows = useMemo(
    () =>
      [...restrictions]
        .map((r) => {
          const allocated = Number(r.allocated) || 0
          const assigned = Number(r.assigned) || 0
          const committed = Number(r.committed) || 0
          const pending = Number(r.pending) || 0
          if (allocated <= 0 && assigned <= 0 && committed <= 0 && pending <= 0) return null
          const available =
            r.available != null ? Number(r.available) : allocated - assigned
          return toPctRow({
            id: r.restriction,
            label: r.restriction,
            capacity: allocated,
            usedAUsd: assigned,
            usedBUsd: committed,
            usedCUsd: pending,
            availableUsd: available,
            remainingUsd: available - committed - pending,
            keepEmpty: true,
          })
        })
        .filter((row): row is PctBarRow => row != null)
        .sort((a, b) => b.capacity - a.capacity || b.remainingUsd - a.remainingUsd),
    [restrictions]
  )

  return (
    <div className="space-y-6">
      {!loading ? <FspTreasuryCards fsps={fsps} /> : null}

      <div className="space-y-2">
        <h4 className="text-lg font-semibold">
          {t('err:allocation_guide_draw_charts_title')}
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {notes.map((note, i) => (
            <div
              key={note.title}
              className={`rounded-md border px-2.5 py-2 shadow-sm ${NOTE_STYLES[i % NOTE_STYLES.length]}`}
            >
              <h4 className="text-[11px] font-semibold text-foreground leading-tight mb-1">
                {note.title}
              </h4>
              <p className="text-[10px] leading-snug text-muted-foreground">{note.body}</p>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-2">
            <div className="rounded-none border-0 bg-card px-2.5 py-2 shadow-md">
              <h4 className="text-[11px] font-semibold mb-0.5">
                {t('err:allocation_guide_draw_states')}
              </h4>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {t('err:allocation_guide_draw_states_hint')}
              </p>
              {loading ? (
                <p className="text-[10px] text-muted-foreground">Loading…</p>
              ) : (
                <BalancePctChart
                  rows={stateRows}
                  empty={t('err:allocation_guide_draw_empty')}
                  capacityLabel="Allocated"
                  usedALabel="Assigned"
                  usedAColor={ASSIGNED_COLOR}
                  usedBLabel="Committed"
                  usedBColor={COMMITTED_COLOR}
                  usedCLabel="Pending"
                  usedCColor={PENDING_COLOR}
                  expanded={chartsExpanded}
                />
              )}
            </div>
            <div className="rounded-none border-0 bg-card px-2.5 py-2 shadow-md">
              <h4 className="text-[11px] font-semibold mb-0.5">
                {t('err:allocation_guide_draw_grants')}
              </h4>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {t('err:allocation_guide_draw_grants_hint')}
              </p>
              {loading ? (
                <p className="text-[10px] text-muted-foreground">Loading…</p>
              ) : (
                <BalancePctChart
                  rows={grantRows}
                  empty={t('err:allocation_guide_draw_empty')}
                  capacityLabel="Transferred"
                  usedALabel="Disbursed"
                  usedAColor={DISBURSED_COLOR}
                  expanded={chartsExpanded}
                />
              )}
            </div>
            <div className="rounded-none border-0 bg-card px-2.5 py-2 shadow-md">
              <h4 className="text-[11px] font-semibold mb-0.5">
                {t('err:allocation_guide_draw_restrictions')}
              </h4>
              <p className="text-[10px] text-muted-foreground mb-1.5">
                {t('err:allocation_guide_draw_restrictions_hint')}
              </p>
              <p className="text-[10px] text-amber-900 bg-amber-50 border border-amber-200 px-2 py-1 mb-1.5">
                {t('err:allocation_guide_draw_restrictions_normalize')}
              </p>
              {loading ? (
                <p className="text-[10px] text-muted-foreground">Loading…</p>
              ) : (
                <BalancePctChart
                  rows={restrictionRows}
                  empty={t('err:allocation_guide_draw_empty')}
                  capacityLabel="Allocated"
                  usedALabel="Assigned"
                  usedAColor={ASSIGNED_COLOR}
                  usedBLabel="Committed"
                  usedBColor={COMMITTED_COLOR}
                  usedCLabel="Pending"
                  usedCColor={PENDING_COLOR}
                  expanded={chartsExpanded}
                />
              )}
            </div>
          </div>
          <div className="flex justify-center">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => setChartsExpanded((v) => !v)}
              aria-expanded={chartsExpanded}
              aria-label={chartsExpanded ? 'Collapse graphs' : 'Expand graphs'}
            >
              {chartsExpanded ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </div>
          </div>
    </div>
  )
}
