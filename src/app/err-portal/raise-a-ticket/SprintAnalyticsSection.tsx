'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis } from 'recharts'
import { useTranslation } from 'react-i18next'
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
import {
  RAISE_TICKET_BIG_ROCK_SHORT_I18N_KEYS,
  RAISE_TICKET_STATUS_I18N_KEYS,
  STATUS_CHART_COLORS,
  STATUS_DATA_KEYS,
  type GithubProjectBigRock,
  type GithubProjectStatus,
  type SprintLevelBucket,
} from '@/lib/raiseTicketGithub'

type SprintAnalyticsChartRow = {
  key: string
  count: number
  fill: string
}

type P0UnassignedTaskRow = {
  title: string
  url: string | null
  status: GithubProjectStatus
  bigRock: GithubProjectBigRock
  sprintLevel: SprintLevelBucket
  daysOpen: number | null
  createdAt: string | null
}

type SprintAnalytics = {
  bySprintLevel: SprintAnalyticsChartRow[]
  byAssignee: SprintAnalyticsChartRow[]
  byBacklogAge: SprintAnalyticsChartRow[]
  p0Unassigned: P0UnassignedTaskRow[]
  totals: {
    open: number
    backlog: number
  }
}

type ApiResponse = {
  analytics: SprintAnalytics
}

interface SprintAnalyticsSectionProps {
  enabled?: boolean
}

function CompactChartCard ({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <Card className="h-full">
      <CardHeader className="space-y-1.5 p-4 pb-2">
        <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
        <CardDescription className="text-xs leading-snug">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-4 pt-0">{children}</CardContent>
    </Card>
  )
}

function SprintMetricChart ({
  title,
  description,
  rows,
  labelForKey,
  loading,
  error,
  emptyMessage,
}: {
  title: string
  description: string
  rows: SprintAnalyticsChartRow[]
  labelForKey: (key: string) => string
  loading?: boolean
  error?: string | null
  emptyMessage: string
}) {
  const { t } = useTranslation('err')
  const chartData = useMemo(
    () =>
      rows.map((row) => ({
        ...row,
        label: labelForKey(row.key),
      })),
    [rows, labelForKey]
  )

  const chartConfig = {
    count: {
      label: t('raise_ticket_chart_count_label', 'Tickets'),
      color: 'hsl(var(--chart-1))',
    },
  } satisfies ChartConfig

  const total = rows.reduce((sum, row) => sum + row.count, 0)

  if (loading) {
    return (
      <CompactChartCard title={title} description={description}>
        <div className="min-h-[200px] flex items-center justify-center text-sm text-muted-foreground">
          {t('raise_ticket_chart_loading', 'Loading chart data…')}
        </div>
      </CompactChartCard>
    )
  }

  if (error) {
    return (
      <CompactChartCard title={title} description={description}>
        <div className="min-h-[200px] flex items-center justify-center text-sm text-destructive px-2 text-center">
          {error}
        </div>
      </CompactChartCard>
    )
  }

  if (!total) {
    return (
      <CompactChartCard title={title} description={description}>
        <div className="min-h-[200px] flex items-center justify-center text-sm text-muted-foreground px-2 text-center">
          {emptyMessage}
        </div>
      </CompactChartCard>
    )
  }

  return (
    <CompactChartCard title={title} description={description}>
      <ChartContainer
        config={chartConfig}
        className="h-[200px] w-full !aspect-auto max-h-none"
      >
        <BarChart
          accessibilityLayer
          data={chartData}
          margin={{ left: 0, right: 4, top: 20, bottom: 0 }}
        >
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="label"
            tickLine={false}
            tickMargin={8}
            axisLine={false}
            interval={0}
            tick={{ fontSize: 9 }}
          />
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel />} />
          <Bar dataKey="count" radius={4}>
            {chartData.map((row) => (
              <Cell key={row.key} fill={row.fill} />
            ))}
            <LabelList
              dataKey="count"
              position="top"
              offset={4}
              className="fill-foreground"
              fontSize={10}
              formatter={(value) => (Number(value) > 0 ? value : '')}
            />
          </Bar>
        </BarChart>
      </ChartContainer>
    </CompactChartCard>
  )
}

function StatusPill ({ status }: { status: GithubProjectStatus }) {
  const { t } = useTranslation('err')
  const color = STATUS_CHART_COLORS[STATUS_DATA_KEYS[status]]

  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium leading-none text-foreground/90 ring-1 ring-border/60"
      style={{ backgroundColor: `${color}55` }}
    >
      {t(RAISE_TICKET_STATUS_I18N_KEYS[status], status)}
    </span>
  )
}

export function SprintAnalyticsSection ({ enabled = true }: SprintAnalyticsSectionProps) {
  const { t } = useTranslation('err')
  const [analytics, setAnalytics] = useState<SprintAnalytics | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const sprintLevelLabel = useMemo(
    () => (key: string) => {
      const labels: Record<string, string> = {
        current: t('raise_ticket_sprint_level_current', 'Current'),
        planned: t('raise_ticket_sprint_level_planned', 'Planned'),
        unscheduled: t('raise_ticket_sprint_level_unscheduled', 'Not in sprint'),
        other: t('raise_ticket_sprint_level_other', 'Other sprint'),
      }
      return labels[key] ?? key
    },
    [t]
  )

  const assigneeLabel = useMemo(
    () => (key: string) => {
      if (key === '__unassigned__') {
        return t('raise_ticket_sprint_unassigned', 'Unassigned')
      }
      if (key === '__other__') {
        return t('raise_ticket_sprint_assignee_other', 'Other')
      }
      return key
    },
    [t]
  )

  const backlogAgeLabel = useMemo(
    () => (key: string) => {
      const labels: Record<string, string> = {
        under_1w: t('raise_ticket_backlog_age_under_1w', '< 1 week'),
        '1_2w': t('raise_ticket_backlog_age_1_2w', '1–2 weeks'),
        '2_4w': t('raise_ticket_backlog_age_2_4w', '2–4 weeks'),
        over_4w: t('raise_ticket_backlog_age_over_4w', '4+ weeks'),
      }
      return labels[key] ?? key
    },
    [t]
  )

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function fetchData () {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/support/github-tickets/sprint-analytics')
        if (!res.ok) {
          const body = await res.json().catch(() => null)
          const msg =
            body &&
            typeof body === 'object' &&
            'detail' in body &&
            typeof (body as { detail?: string }).detail === 'string'
              ? (body as { detail: string }).detail
              : body &&
                typeof body === 'object' &&
                'error' in body &&
                typeof (body as { error?: string }).error === 'string'
                ? (body as { error: string }).error
                : 'Failed to load sprint analytics'
          throw new Error(msg)
        }
        const json = (await res.json()) as ApiResponse
        if (!cancelled) setAnalytics(json.analytics)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load sprint analytics')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchData()
    return () => {
      cancelled = true
    }
  }, [enabled])

  if (!enabled) return null

  const chartError = error
  const rows = analytics

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <SprintMetricChart
          title={t('raise_ticket_sprint_chart_level_title', 'Tasks by sprint')}
          description={t(
            'raise_ticket_sprint_chart_level_desc',
            '{{count}} open tasks by sprint assignment',
            { count: rows?.totals.open ?? 0 }
          )}
          rows={rows?.bySprintLevel ?? []}
          labelForKey={sprintLevelLabel}
          loading={loading}
          error={chartError}
          emptyMessage={t(
            'raise_ticket_sprint_chart_level_empty',
            'No open tasks on the board.'
          )}
        />
        <SprintMetricChart
          title={t('raise_ticket_sprint_chart_assignee_title', 'Tasks by assignee')}
          description={t(
            'raise_ticket_sprint_chart_assignee_desc',
            'Open tasks grouped by GitHub assignee'
          )}
          rows={rows?.byAssignee ?? []}
          labelForKey={assigneeLabel}
          loading={loading}
          error={chartError}
          emptyMessage={t(
            'raise_ticket_sprint_chart_assignee_empty',
            'No open assigned tasks on the board.'
          )}
        />
        <SprintMetricChart
          title={t('raise_ticket_sprint_chart_backlog_age_title', 'Backlog age')}
          description={t(
            'raise_ticket_sprint_chart_backlog_age_desc',
            '{{count}} backlog items by time open',
            { count: rows?.totals.backlog ?? 0 }
          )}
          rows={rows?.byBacklogAge ?? []}
          labelForKey={backlogAgeLabel}
          loading={loading}
          error={chartError}
          emptyMessage={t(
            'raise_ticket_sprint_chart_backlog_age_empty',
            'No backlog items with a created date.'
          )}
        />
      </div>

      <Card>
        <CardHeader className="space-y-1.5 p-4 pb-2">
          <CardTitle className="text-base font-semibold leading-tight">
            {t('raise_ticket_p0_unassigned_title', 'P0 tasks without assignee')}
          </CardTitle>
          <CardDescription className="text-xs leading-snug">
            {t(
              'raise_ticket_p0_unassigned_desc',
              'Open P0 priority items with no GitHub assignee · {{count}} tasks',
              { count: rows?.p0Unassigned.length ?? 0 }
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {loading ? (
            <div className="min-h-[120px] flex items-center justify-center text-sm text-muted-foreground">
              {t('raise_ticket_chart_loading', 'Loading chart data…')}
            </div>
          ) : error ? (
            <div className="min-h-[120px] flex items-center justify-center text-sm text-destructive px-2 text-center">
              {error}
            </div>
          ) : !rows?.p0Unassigned.length ? (
            <div className="min-h-[120px] flex items-center justify-center text-sm text-muted-foreground px-2 text-center">
              {t(
                'raise_ticket_p0_unassigned_empty',
                'No open P0 tasks without an assignee.'
              )}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg ring-1 ring-border/50">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th className="px-3 py-2 font-medium">
                      {t('raise_ticket_sprint_col_task', 'Task')}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t('raise_ticket_sprint_col_status', 'Status')}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t('raise_ticket_sprint_col_sprint', 'Sprint')}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t('raise_ticket_p0_col_days_open', 'Days open')}
                    </th>
                    <th className="px-3 py-2 font-medium">
                      {t('raise_ticket_sprint_col_big_rock', 'Big Rock')}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {rows.p0Unassigned.map((task, index) => (
                    <tr key={`${task.url ?? task.title}-${index}`} className="hover:bg-muted/20">
                      <td className="px-3 py-2.5 font-medium text-foreground">
                        {task.url ? (
                          <Link
                            href={task.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group inline-flex max-w-[18rem] items-start gap-1.5 hover:text-primary"
                          >
                            <span className="truncate">{task.title}</span>
                            <ExternalLink
                              className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60 group-hover:opacity-100"
                              aria-hidden
                            />
                          </Link>
                        ) : (
                          <span className="block max-w-[18rem] truncate">{task.title}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <StatusPill status={task.status} />
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {sprintLevelLabel(task.sprintLevel)}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-muted-foreground">
                        {task.daysOpen ?? t('raise_ticket_sprint_not_set', '—')}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-muted-foreground">
                        {t(RAISE_TICKET_BIG_ROCK_SHORT_I18N_KEYS[task.bigRock], task.bigRock)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
