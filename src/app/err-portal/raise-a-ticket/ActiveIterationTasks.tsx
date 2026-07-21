'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  GITHUB_PROJECT_STATUS_CHART_ORDER,
  GITHUB_PROJECT_TEAM_REQUEST_CHART_ORDER,
  RAISE_TICKET_BIG_ROCK_SHORT_I18N_KEYS,
  RAISE_TICKET_STATUS_I18N_KEYS,
  RAISE_TICKET_TASK_TYPE_SHORT_I18N_KEYS,
  RAISE_TICKET_TEAM_REQUEST_I18N_KEYS,
  STATUS_CHART_COLORS,
  STATUS_DATA_KEYS,
  TEAM_REQUEST_CHART_COLORS,
  type GithubProjectBigRock,
  type GithubProjectStatus,
  type GithubProjectTeamRequest,
} from '@/lib/raiseTicketGithub'

type ActiveIterationTask = {
  title: string
  url: string | null
  status: GithubProjectStatus
  bigRock: GithubProjectBigRock
  typeOfTask: string | null
  teamRequest?: GithubProjectTeamRequest
  priority: string | null
  size: string | null
  assignees: string[]
}

type TeamRequestCounts = Record<GithubProjectTeamRequest, number>

type SprintTaskListReport = {
  tasks: ActiveIterationTask[]
  statusCounts: Record<GithubProjectStatus, number>
  teamRequestCounts?: TeamRequestCounts
  total: number
}

type ActiveIterationReport = SprintTaskListReport & {
  iteration: {
    iterationId: string
    title: string
    startDate: string
    duration: number
  }
  dateRange: string
}

type ApiResponse = {
  previous: ActiveIterationReport | null
  active: ActiveIterationReport | null
  planned: ActiveIterationReport | null
  unscheduled: SprintTaskListReport
}

interface ActiveIterationTasksProps {
  enabled?: boolean
}

const UNSCHEDULED_PAGE_SIZE = 10

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

function FieldValue ({
  value,
  emptyLabel,
}: {
  value: string | null
  emptyLabel: string
}) {
  return (
    <span className="text-xs text-muted-foreground">
      {value ?? emptyLabel}
    </span>
  )
}
function StatusSummary ({ report }: { report: SprintTaskListReport }) {
  if (report.total === 0) return null

  return (
    <div className="flex flex-wrap gap-2">
      {GITHUB_PROJECT_STATUS_CHART_ORDER.map((status) => {
        const count = report.statusCounts[status] ?? 0
        if (count === 0) return null
        return (
          <div key={status} className="flex items-center gap-1.5">
            <StatusPill status={status} />
            <span className="text-[10px] tabular-nums text-muted-foreground">{count}</span>
          </div>
        )
      })}
    </div>
  )
}

function TeamRequestSummary ({ report }: { report: SprintTaskListReport }) {
  if (report.total === 0) return null

  const counts = report.teamRequestCounts
  const hasCounts = counts && GITHUB_PROJECT_TEAM_REQUEST_CHART_ORDER.some((key) => (counts[key] ?? 0) > 0)
  if (!hasCounts) {
    // Fallback for older API payloads without teamRequestCounts
    const derived = Object.fromEntries(
      GITHUB_PROJECT_TEAM_REQUEST_CHART_ORDER.map((key) => [key, 0])
    ) as TeamRequestCounts
    for (const task of report.tasks) {
      const key = task.teamRequest ?? 'Not set'
      if (key in derived) derived[key as GithubProjectTeamRequest] += 1
    }
    return <TeamRequestPills counts={derived} total={report.total} />
  }

  return <TeamRequestPills counts={counts} total={report.total} />
}

function TeamRequestPills ({
  counts,
  total,
}: {
  counts: TeamRequestCounts
  total: number
}) {
  const { t } = useTranslation('err')

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {t('raise_ticket_sprint_team_request_label', 'Team Request')}
      </p>
      <div className="flex flex-wrap gap-2">
        {GITHUB_PROJECT_TEAM_REQUEST_CHART_ORDER.map((team) => {
          const count = counts[team] ?? 0
          if (count === 0) return null
          const percent = total > 0 ? Math.round((count / total) * 100) : 0
          const color = TEAM_REQUEST_CHART_COLORS[team]
          return (
            <div
              key={team}
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium leading-none text-foreground/90 ring-1 ring-border/60"
              style={{ backgroundColor: `${color}55` }}
            >
              <span>{t(RAISE_TICKET_TEAM_REQUEST_I18N_KEYS[team], team)}</span>
              <span className="tabular-nums text-muted-foreground">
                {percent}%
                <span className="opacity-70"> · {count}</span>
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TaskTable ({
  tasks,
  emptyMessage,
}: {
  tasks: ActiveIterationTask[]
  emptyMessage: string
}) {
  const { t } = useTranslation('err')
  const notSet = t('raise_ticket_sprint_not_set', '—')

  if (!tasks.length) {
    return (
      <div className="rounded-lg px-3 py-6 text-center text-sm text-muted-foreground ring-1 ring-border/50">
        {emptyMessage}
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-border/50">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead>
          <tr className="border-b border-border/60 bg-muted/30 text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">{t('raise_ticket_sprint_col_task', 'Task')}</th>
            <th className="px-3 py-2 font-medium">
              {t('raise_ticket_sprint_col_assigned', 'Assigned to')}
            </th>
            <th className="px-3 py-2 font-medium">{t('raise_ticket_sprint_col_priority', 'Priority')}</th>
            <th className="px-3 py-2 font-medium">{t('raise_ticket_sprint_col_size', 'Size')}</th>
            <th className="px-3 py-2 font-medium">{t('raise_ticket_sprint_col_status', 'Status')}</th>
            <th className="px-3 py-2 font-medium">
              {t('raise_ticket_sprint_col_type_of_task', 'Type of Task')}
            </th>
            <th className="px-3 py-2 font-medium">
              {t('raise_ticket_sprint_col_team_request', 'Team Request')}
            </th>
            <th className="px-3 py-2 font-medium">{t('raise_ticket_sprint_col_big_rock', 'Big Rock')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {tasks.map((task, index) => {
            const typeOfTaskKey = task.typeOfTask
              ? RAISE_TICKET_TASK_TYPE_SHORT_I18N_KEYS[task.typeOfTask]
              : undefined
            const typeOfTaskLabel = task.typeOfTask
              ? typeOfTaskKey
                ? t(typeOfTaskKey, task.typeOfTask)
                : task.typeOfTask
              : notSet

            return (
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
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {task.assignees.length
                  ? task.assignees.join(', ')
                  : t('raise_ticket_sprint_unassigned', 'Unassigned')}
              </td>
              <td className="px-3 py-2.5">
                <FieldValue value={task.priority} emptyLabel={notSet} />
              </td>
              <td className="px-3 py-2.5">
                <FieldValue value={task.size} emptyLabel={notSet} />
              </td>
              <td className="px-3 py-2.5">
                <StatusPill status={task.status} />
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {typeOfTaskLabel}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {task.teamRequest
                  ? t(RAISE_TICKET_TEAM_REQUEST_I18N_KEYS[task.teamRequest], task.teamRequest)
                  : notSet}
              </td>
              <td className="px-3 py-2.5 text-xs text-muted-foreground">
                {t(RAISE_TICKET_BIG_ROCK_SHORT_I18N_KEYS[task.bigRock], task.bigRock)}
              </td>
            </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function PaginatedTaskListSection ({
  heading,
  description,
  report,
  emptyMessage,
  pageSize,
}: {
  heading: string
  description: string
  report: SprintTaskListReport
  emptyMessage: string
  pageSize: number
}) {
  const { t } = useTranslation('err')
  const [page, setPage] = useState(1)

  useEffect(() => {
    setPage(1)
  }, [report.total])

  const totalPages = Math.max(1, Math.ceil(report.tasks.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const paginatedTasks = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return report.tasks.slice(start, start + pageSize)
  }, [report.tasks, currentPage, pageSize])

  const rangeStart = report.tasks.length ? (currentPage - 1) * pageSize + 1 : 0
  const rangeEnd = Math.min(currentPage * pageSize, report.tasks.length)

  return (
    <section className="space-y-2">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <p className="text-xs text-muted-foreground">{description}</p>
        <StatusSummary report={report} />
        <TeamRequestSummary report={report} />
      </div>
      <TaskTable tasks={paginatedTasks} emptyMessage={emptyMessage} />
      {report.tasks.length > pageSize ? (
        <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {t(
              'raise_ticket_sprint_page_meta',
              'Showing {{from}}–{{to}} of {{total}}',
              { from: rangeStart, to: rangeEnd, total: report.tasks.length }
            )}
          </p>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setPage((prev) => Math.max(1, prev - 1))}
              disabled={currentPage <= 1}
            >
              {t('raise_ticket_sprint_page_prev', 'Previous')}
            </Button>
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('raise_ticket_sprint_page_indicator', 'Page {{page}} of {{total}}', {
                page: currentPage,
                total: totalPages,
              })}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 px-3 text-xs"
              onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
              disabled={currentPage >= totalPages}
            >
              {t('raise_ticket_sprint_page_next', 'Next')}
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function IterationSection ({
  heading,
  report,
  emptyMessage,
}: {
  heading: string
  report: ActiveIterationReport
  emptyMessage: string
}) {
  const { t } = useTranslation('err')

  return (
    <section className="space-y-2">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
        <p className="text-xs text-muted-foreground">
          {t('raise_ticket_sprint_iteration_meta', '{{title}} · {{range}} · {{count}} tasks', {
            title: report.iteration.title,
            range: report.dateRange,
            count: report.total,
          })}
        </p>
        <StatusSummary report={report} />
        <TeamRequestSummary report={report} />
      </div>
      <TaskTable tasks={report.tasks} emptyMessage={emptyMessage} />
    </section>
  )
}

export function ActiveIterationTasks ({ enabled = true }: ActiveIterationTasksProps) {
  const { t, i18n } = useTranslation('err')
  const [previous, setPrevious] = useState<ActiveIterationReport | null>(null)
  const [active, setActive] = useState<ActiveIterationReport | null>(null)
  const [planned, setPlanned] = useState<ActiveIterationReport | null>(null)
  const [unscheduled, setUnscheduled] = useState<SprintTaskListReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!enabled) return
    let cancelled = false

    async function fetchData () {
      setLoading(true)
      setError(null)
      try {
        const locale = i18n.language?.startsWith('ar') ? 'ar' : 'en'
        const res = await fetch(
          `/api/support/github-tickets/active-iteration?locale=${encodeURIComponent(locale)}`
        )
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
                : 'Failed to load sprint tasks'
          throw new Error(msg)
        }
        const json = (await res.json()) as ApiResponse
        if (!cancelled) {
          setPrevious(json.previous ?? null)
          setActive(json.active ?? null)
          setPlanned(json.planned ?? null)
          setUnscheduled(json.unscheduled)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load sprint tasks')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchData()
    return () => {
      cancelled = true
    }
  }, [enabled, i18n.language])

  if (!enabled) return null

  const title = t('raise_ticket_sprint_title', 'Sprints')

  return (
    <Card>
      <CardHeader className="space-y-1.5 p-4 pb-2">
        <CardTitle className="text-base font-semibold leading-tight">{title}</CardTitle>
        <CardDescription className="text-xs leading-relaxed">
          {t(
            'raise_ticket_sprint_intro',
            'Work is organised in two-week sprint cycles on the GitHub project board. Progress is reviewed weekly and tasks move between the previous, current, and planned sprints.'
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 p-4 pt-0">
        {loading ? (
          <div className="min-h-[120px] flex items-center justify-center text-sm text-muted-foreground">
            {t('raise_ticket_chart_loading', 'Loading chart data…')}
          </div>
        ) : error ? (
          <div className="min-h-[120px] flex items-center justify-center text-sm text-destructive px-2 text-center">
            {error}
          </div>
        ) : (
          <>
            {previous ? (
              <IterationSection
                heading={t('raise_ticket_sprint_previous_heading', 'Previous sprint')}
                report={previous}
                emptyMessage={t(
                  'raise_ticket_sprint_previous_empty',
                  'No tasks are assigned to the previous sprint.'
                )}
              />
            ) : null}
            {active ? (
              <IterationSection
                heading={t('raise_ticket_sprint_current_heading', 'Current sprint')}
                report={active}
                emptyMessage={t(
                  'raise_ticket_sprint_empty',
                  'No tasks are assigned to the current sprint yet.'
                )}
              />
            ) : null}
            {planned ? (
              <IterationSection
                heading={t('raise_ticket_sprint_planned_heading', 'Planned sprint')}
                report={planned}
                emptyMessage={t(
                  'raise_ticket_sprint_planned_empty',
                  'No tasks are assigned to the planned sprint yet.'
                )}
              />
            ) : null}
            {unscheduled ? (
              <PaginatedTaskListSection
                heading={t('raise_ticket_sprint_unscheduled_heading', 'Not in a sprint')}
                description={t(
                  'raise_ticket_sprint_unscheduled_desc',
                  'Open tasks (Backlog, Ready, In progress) with no sprint · {{count}} tasks',
                  { count: unscheduled.total }
                )}
                report={unscheduled}
                emptyMessage={t(
                  'raise_ticket_sprint_unscheduled_empty',
                  'All open tasks are assigned to a sprint.'
                )}
                pageSize={UNSCHEDULED_PAGE_SIZE}
              />
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  )
}
