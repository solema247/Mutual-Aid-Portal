import {
  GITHUB_PROJECT_ALL_TASK_TYPES,
  GITHUB_PROJECT_BIG_ROCKS,
  GITHUB_PROJECT_BIG_ROCK_NOT_SET,
  GITHUB_PROJECT_OPEN_STATUSES,
  GITHUB_PROJECT_STATUS_BACKLOG,
  GITHUB_PROJECT_STATUS_CHART_ORDER,
  GITHUB_PROJECT_STATUS_DONE,
  STATUS_DATA_KEYS,
  STATUS_SERIES,
  normalizeProjectStatus,
  taskTypeToChartKey,
  type BigRockTaskChartPoint,
  type GithubProjectBigRock,
  type GithubProjectStatus,
  type StatusDataKey,
  type TicketStatusFilter,
  BACKLOG_AGE_BUCKETS,
  BACKLOG_AGE_CHART_COLORS,
  SPRINT_ASSIGNEE_CHART_COLORS,
  SPRINT_LEVEL_BUCKETS,
  SPRINT_LEVEL_CHART_COLORS,
  isP0ProjectPriority,
  type BacklogAgeBucket,
  type SprintLevelBucket,
} from '@/lib/raiseTicketGithub'

export type ProjectRef = {
  ownerLogin: string
  ownerType: 'user' | 'org'
  projectNumber: number
}

export type StatusCounts = Record<GithubProjectStatus, number>

export type BigRockCounts = Record<GithubProjectBigRock, number>

export type ProjectItemSnapshot = {
  bigRock: GithubProjectBigRock
  status: string | null
  typeOfTask: string | null
  priority: string | null
  size: string | null
  title: string | null
  url: string | null
  assignees: string[]
  createdAt: string | null
  iteration: ProjectIteration | null
}

export type ProjectIteration = {
  iterationId: string
  title: string
  startDate: string
  duration: number
}

export type ActiveIterationTask = {
  title: string
  url: string | null
  status: GithubProjectStatus
  bigRock: GithubProjectBigRock
  typeOfTask: string | null
  priority: string | null
  size: string | null
  assignees: string[]
}

export type SprintTaskListReport = {
  tasks: ActiveIterationTask[]
  statusCounts: StatusCounts
  total: number
}

export type ActiveIterationReport = SprintTaskListReport & {
  iteration: ProjectIteration
  dateRange: string
}

export type SprintReports = {
  previous: ActiveIterationReport | null
  active: ActiveIterationReport | null
  planned: ActiveIterationReport | null
  unscheduled: SprintTaskListReport
}

export type SprintAnalyticsChartRow = {
  key: string
  count: number
  fill: string
}

export type P0UnassignedTaskRow = {
  title: string
  url: string | null
  status: GithubProjectStatus
  bigRock: GithubProjectBigRock
  sprintLevel: SprintLevelBucket
  daysOpen: number | null
  createdAt: string | null
}

export type SprintAnalytics = {
  bySprintLevel: SprintAnalyticsChartRow[]
  byAssignee: SprintAnalyticsChartRow[]
  byBacklogAge: SprintAnalyticsChartRow[]
  p0Unassigned: P0UnassignedTaskRow[]
  totals: {
    open: number
    backlog: number
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000
const BIG_ROCK_FIELD = process.env.GITHUB_PROJECT_BIG_ROCK_FIELD ?? 'Big Rock'
const STATUS_FIELD = process.env.GITHUB_PROJECT_STATUS_FIELD ?? 'Status'
const TYPE_OF_TASK_FIELD = process.env.GITHUB_PROJECT_TYPE_OF_TASK_FIELD ?? 'Type of Task'
const ITERATION_FIELD = process.env.GITHUB_PROJECT_ITERATION_FIELD ?? 'Iteration'
const PRIORITY_FIELD = process.env.GITHUB_PROJECT_PRIORITY_FIELD ?? 'Priority'
const SIZE_FIELD = process.env.GITHUB_PROJECT_SIZE_FIELD ?? 'Size'

let cachedProjectData: {
  at: number
  key: string
  items: ProjectItemSnapshot[]
  iterationConfig: ProjectIteration[]
} | null = null

function buildProjectItemsQuery (ownerKind: 'user' | 'organization'): string {
  return `
query ProjectItems($login: String!, $number: Int!, $cursor: String) {
  owner: ${ownerKind}(login: $login) {
    projectV2(number: $number) {
      items(first: 100, after: $cursor) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          type
          content {
            ... on Issue {
              title
              url
              createdAt
              assignees(first: 5) {
                nodes {
                  login
                }
              }
            }
            ... on DraftIssue {
              title
            }
          }
          fieldValues(first: 30) {
            nodes {
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field {
                  ... on ProjectV2SingleSelectField {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldNumberValue {
                number
                field {
                  ... on ProjectV2FieldCommon {
                    name
                  }
                }
              }
              ... on ProjectV2ItemFieldIterationValue {
                title
                startDate
                duration
                iterationId
                field {
                  ... on ProjectV2IterationField {
                    name
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
`
}

function buildIterationConfigQuery (ownerKind: 'user' | 'organization'): string {
  return `
query ProjectIterationConfig($login: String!, $number: Int!) {
  owner: ${ownerKind}(login: $login) {
    projectV2(number: $number) {
      fields(first: 30) {
        nodes {
          ... on ProjectV2IterationField {
            name
            configuration {
              iterations {
                id
                title
                startDate
                duration
              }
              completedIterations {
                id
                title
                startDate
                duration
              }
            }
          }
        }
      }
    }
  }
}
`
}

function emptyStatusCounts (): StatusCounts {
  return Object.fromEntries(
    GITHUB_PROJECT_STATUS_CHART_ORDER.map((status) => [status, 0])
  ) as StatusCounts
}

function emptyCounts (): BigRockCounts {
  return Object.fromEntries(
    [...GITHUB_PROJECT_BIG_ROCKS, GITHUB_PROJECT_BIG_ROCK_NOT_SET].map((bigRock) => [bigRock, 0])
  ) as BigRockCounts
}

function projectCacheKey (project: ProjectRef): string {
  return `${project.ownerType}:${project.ownerLogin}:${project.projectNumber}`
}

export function resolveGithubProjectRef (): ProjectRef {
  const boardUrl =
    process.env.GITHUB_PROJECT_BOARD_URL ??
    process.env.NEXT_PUBLIC_GITHUB_PROJECT_BOARD_URL ??
    'https://github.com/users/solema247/projects/6'

  try {
    const parsed = new URL(boardUrl)
    const parts = parsed.pathname.split('/').filter(Boolean)
    const ownerType = parts[0] === 'orgs' ? 'org' : 'user'
    const ownerLogin = parts[1]
    const projectNumber = Number(parts[3])
    if (ownerLogin && Number.isFinite(projectNumber)) {
      return { ownerLogin, ownerType, projectNumber }
    }
  } catch {
    // fall through to env defaults
  }

  return {
    ownerLogin: process.env.GITHUB_PROJECT_OWNER ?? 'solema247',
    ownerType: (process.env.GITHUB_PROJECT_OWNER_TYPE === 'org' ? 'org' : 'user'),
    projectNumber: Number(process.env.GITHUB_PROJECT_NUMBER ?? 6),
  }
}

type GraphqlFieldValue = {
  name?: string
  number?: number
  title?: string
  startDate?: string
  duration?: number
  iterationId?: string
  field?: { name?: string }
}

type GraphqlProjectItem = {
  type?: string
  content?: {
    title?: string
    url?: string
    createdAt?: string
    assignees?: { nodes?: Array<{ login?: string }> }
  }
  fieldValues?: { nodes?: GraphqlFieldValue[] }
}

type GraphqlPage = {
  owner?: {
    projectV2?: {
      items?: {
        pageInfo?: { hasNextPage?: boolean; endCursor?: string | null }
        nodes?: GraphqlProjectItem[]
      }
    }
  }
}

type GraphqlIterationNode = {
  id?: string
  title?: string
  startDate?: string
  duration?: number
}

type GraphqlIterationConfigPage = {
  owner?: {
    projectV2?: {
      fields?: {
        nodes?: Array<{
          name?: string
          configuration?: {
            iterations?: GraphqlIterationNode[]
            completedIterations?: GraphqlIterationNode[]
          }
        }>
      }
    }
  }
}

async function graphqlRequest (
  token: string,
  project: ProjectRef,
  cursor: string | null
): Promise<GraphqlPage> {
  const ownerKind = project.ownerType === 'org' ? 'organization' : 'user'
  const query = buildProjectItemsQuery(ownerKind)

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        login: project.ownerLogin,
        number: project.projectNumber,
        cursor,
      },
    }),
    next: { revalidate: 0 },
  })

  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      json &&
      typeof json === 'object' &&
      'message' in json &&
      typeof (json as { message?: string }).message === 'string'
        ? (json as { message: string }).message
        : `GitHub GraphQL returned ${res.status}`
    throw new Error(msg)
  }

  if (
    json &&
    typeof json === 'object' &&
    'errors' in json &&
    Array.isArray((json as { errors?: unknown[] }).errors) &&
    (json as { errors: { message?: string }[] }).errors.length
  ) {
    const messages = (json as { errors: { message?: string }[] }).errors
      .map((e) => e.message)
      .filter(Boolean)
      .join('; ')
    throw new Error(messages || 'GitHub GraphQL query failed')
  }

  return (json as { data?: GraphqlPage })?.data ?? {}
}

function readSingleSelectField (
  item: GraphqlProjectItem,
  fieldName: string
): string | null {
  const values = item.fieldValues?.nodes ?? []
  for (const node of values) {
    if (node.field?.name === fieldName && node.name) {
      return node.name
    }
  }
  return null
}

function readProjectFieldValue (
  item: GraphqlProjectItem,
  fieldName: string
): string | null {
  const values = item.fieldValues?.nodes ?? []
  for (const node of values) {
    if (node.field?.name !== fieldName) continue
    if (node.name) return node.name
    if (typeof node.number === 'number') return String(node.number)
  }
  return null
}

function readBigRock (item: GraphqlProjectItem): GithubProjectBigRock {
  const value = readSingleSelectField(item, BIG_ROCK_FIELD)
  if (value && (GITHUB_PROJECT_BIG_ROCKS as readonly string[]).includes(value)) {
    return value as GithubProjectBigRock
  }
  return GITHUB_PROJECT_BIG_ROCK_NOT_SET
}

function readStatus (item: GraphqlProjectItem): string | null {
  return readSingleSelectField(item, STATUS_FIELD)
}

function readTypeOfTask (item: GraphqlProjectItem): string | null {
  return readSingleSelectField(item, TYPE_OF_TASK_FIELD)
}

function readPriority (item: GraphqlProjectItem): string | null {
  return readProjectFieldValue(item, PRIORITY_FIELD)
}

function readSize (item: GraphqlProjectItem): string | null {
  return readProjectFieldValue(item, SIZE_FIELD)
}

function readIteration (item: GraphqlProjectItem): ProjectIteration | null {
  const values = item.fieldValues?.nodes ?? []
  for (const node of values) {
    if (
      node.field?.name === ITERATION_FIELD &&
      node.iterationId &&
      node.title &&
      node.startDate &&
      typeof node.duration === 'number'
    ) {
      return {
        iterationId: node.iterationId,
        title: node.title,
        startDate: node.startDate,
        duration: node.duration,
      }
    }
  }
  return null
}

function readItemContent (item: GraphqlProjectItem): {
  title: string | null
  url: string | null
  assignees: string[]
  createdAt: string | null
} {
  const title = item.content?.title ?? null
  const url = item.content?.url ?? null
  const createdAt = item.content?.createdAt ?? null
  const assignees =
    item.content?.assignees?.nodes
      ?.map((node) => node.login)
      .filter((login): login is string => Boolean(login)) ?? []
  return { title, url, assignees, createdAt }
}

export function sortIterationsByStart (iterations: ProjectIteration[]): ProjectIteration[] {
  return [...iterations].sort((a, b) => a.startDate.localeCompare(b.startDate))
}

export function isIterationPlanned (
  iteration: Pick<ProjectIteration, 'startDate'>,
  now = new Date()
): boolean {
  const start = new Date(`${iteration.startDate}T12:00:00`)
  return start > now
}

export function resolvePlannedIteration (
  iterations: ProjectIteration[],
  now = new Date()
): ProjectIteration | null {
  const sorted = sortIterationsByStart(iterations)
  const active = resolveActiveIteration(sorted, now)
  if (active) {
    const activeIndex = sorted.findIndex(
      (iteration) => iteration.iterationId === active.iterationId
    )
    if (activeIndex >= 0 && activeIndex < sorted.length - 1) {
      return sorted[activeIndex + 1]
    }
    return null
  }
  return sorted.find((iteration) => isIterationPlanned(iteration, now)) ?? null
}

export function isIterationCompleted (
  iteration: Pick<ProjectIteration, 'startDate' | 'duration'>,
  now = new Date()
): boolean {
  const start = new Date(`${iteration.startDate}T12:00:00`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + iteration.duration)
  return end <= now
}

export function resolvePreviousIteration (
  iterations: ProjectIteration[],
  now = new Date()
): ProjectIteration | null {
  const sorted = sortIterationsByStart(iterations)
  const active = resolveActiveIteration(sorted, now)
  if (active) {
    const activeIndex = sorted.findIndex(
      (iteration) => iteration.iterationId === active.iterationId
    )
    if (activeIndex > 0) {
      return sorted[activeIndex - 1]
    }
    return null
  }

  const completed = sorted.filter((iteration) => isIterationCompleted(iteration, now))
  return completed.length ? completed[completed.length - 1] : null
}

export function isIterationActive (
  iteration: Pick<ProjectIteration, 'startDate' | 'duration'>,
  now = new Date()
): boolean {
  const start = new Date(`${iteration.startDate}T12:00:00`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + iteration.duration)
  return now >= start && now < end
}

export function resolveActiveIteration (
  iterations: ProjectIteration[],
  now = new Date()
): ProjectIteration | null {
  return iterations.find((iteration) => isIterationActive(iteration, now)) ?? null
}

export function formatIterationDateRange (
  startDate: string,
  durationDays: number,
  locale = 'en'
): string {
  const start = new Date(`${startDate}T12:00:00`)
  const end = new Date(start)
  end.setUTCDate(end.getUTCDate() + durationDays - 1)
  const fmt = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' })
  return `${fmt.format(start)} – ${fmt.format(end)}`
}

function statusSortIndex (status: GithubProjectStatus): number {
  return GITHUB_PROJECT_STATUS_CHART_ORDER.indexOf(status)
}

function emptyStatusRow (): Record<StatusDataKey, number> {
  return Object.fromEntries(STATUS_SERIES.map((key) => [key, 0])) as Record<StatusDataKey, number>
}

function discoverTaskTypesForBigRock (
  items: ProjectItemSnapshot[],
  bigRock: GithubProjectBigRock
): string[] {
  const found = new Set<string>()
  for (const item of items) {
    if (item.bigRock !== bigRock || !item.typeOfTask) continue
    found.add(item.typeOfTask)
  }

  const canonical = GITHUB_PROJECT_ALL_TASK_TYPES.filter((taskType) => found.has(taskType))
  const extras = [...found]
    .filter((taskType) => !(GITHUB_PROJECT_ALL_TASK_TYPES as readonly string[]).includes(taskType))
    .sort((a, b) => a.localeCompare(b))

  return [...canonical, ...extras]
}

export function buildBigRockTaskMatrix (
  items: ProjectItemSnapshot[],
  bigRock: GithubProjectBigRock
): BigRockTaskChartPoint[] {
  const taskTypes = discoverTaskTypesForBigRock(items, bigRock)
  if (!taskTypes.length) return []

  const matrix = Object.fromEntries(
    taskTypes.map((taskType) => [taskType, emptyStatusRow()])
  ) as Record<string, Record<StatusDataKey, number>>

  for (const item of items) {
    if (item.bigRock !== bigRock || !item.typeOfTask) continue
    if (!matrix[item.typeOfTask]) continue

    const status = normalizeProjectStatus(item.status)
    const statusKey = STATUS_DATA_KEYS[status]
    matrix[item.typeOfTask][statusKey] += 1
  }

  return taskTypes.map((taskTypeLabel) => ({
    taskTypeKey: taskTypeToChartKey(taskTypeLabel),
    taskTypeLabel,
    ...matrix[taskTypeLabel],
  }))
}

export function matchesStatusFilter (
  status: string | null,
  filter: TicketStatusFilter
): boolean {
  if (filter === 'closed') {
    return status === GITHUB_PROJECT_STATUS_DONE
  }
  if (status == null) return true
  return (GITHUB_PROJECT_OPEN_STATUSES as readonly string[]).includes(status)
}

export function aggregateItemsByStatusForBigRock (
  items: ProjectItemSnapshot[],
  bigRock: GithubProjectBigRock
): StatusCounts {
  const counts = emptyStatusCounts()
  for (const item of items) {
    if (item.bigRock !== bigRock) continue
    const status = normalizeProjectStatus(item.status)
    counts[status] += 1
  }
  return counts
}

export function aggregateItemsByBigRock (
  items: ProjectItemSnapshot[],
  filter: TicketStatusFilter
): BigRockCounts {
  const counts = emptyCounts()
  for (const item of items) {
    if (!matchesStatusFilter(item.status, filter)) continue
    counts[item.bigRock] += 1
  }
  return counts
}

async function fetchIterationConfig (
  token: string,
  project: ProjectRef
): Promise<ProjectIteration[]> {
  const ownerKind = project.ownerType === 'org' ? 'organization' : 'user'
  const query = buildIterationConfigQuery(ownerKind)

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query,
      variables: {
        login: project.ownerLogin,
        number: project.projectNumber,
      },
    }),
    next: { revalidate: 0 },
  })

  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    throw new Error(`GitHub GraphQL returned ${res.status}`)
  }

  const data = (json as { data?: GraphqlIterationConfigPage })?.data ?? {}
  const fields = data.owner?.projectV2?.fields?.nodes ?? []

  for (const field of fields) {
    if (field.name !== ITERATION_FIELD) continue
    const mapNodes = (nodes: GraphqlIterationNode[]): ProjectIteration[] =>
      nodes
        .filter(
          (iteration): iteration is Required<GraphqlIterationNode> =>
            Boolean(iteration.id && iteration.title && iteration.startDate && iteration.duration)
        )
        .map((iteration) => ({
          iterationId: iteration.id,
          title: iteration.title,
          startDate: iteration.startDate,
          duration: iteration.duration,
        }))

    const byId = new Map<string, ProjectIteration>()
    for (const iteration of [
      ...mapNodes(field.configuration?.completedIterations ?? []),
      ...mapNodes(field.configuration?.iterations ?? []),
    ]) {
      byId.set(iteration.iterationId, iteration)
    }
    return [...byId.values()]
  }

  return []
}

async function fetchProjectData (
  token: string,
  project: ProjectRef
): Promise<{ items: ProjectItemSnapshot[]; iterationConfig: ProjectIteration[] }> {
  const now = Date.now()
  const key = projectCacheKey(project)
  if (cachedProjectData && cachedProjectData.key === key && now - cachedProjectData.at < CACHE_TTL_MS) {
    return {
      items: cachedProjectData.items,
      iterationConfig: cachedProjectData.iterationConfig,
    }
  }

  const iterationConfig = await fetchIterationConfig(token, project)

  const items: ProjectItemSnapshot[] = []
  let cursor: string | null = null

  while (true) {
    const data = await graphqlRequest(token, project, cursor)
    const page = data.owner?.projectV2?.items
    const nodes = page?.nodes ?? []

    for (const node of nodes) {
      if (node.type === 'PULL_REQUEST') continue
      const { title, url, assignees, createdAt } = readItemContent(node)
      items.push({
        bigRock: readBigRock(node),
        status: readStatus(node),
        typeOfTask: readTypeOfTask(node),
        priority: readPriority(node),
        size: readSize(node),
        title,
        url,
        assignees,
        createdAt,
        iteration: readIteration(node),
      })
    }

    if (!page?.pageInfo?.hasNextPage) break
    cursor = page.pageInfo.endCursor ?? null
    if (!cursor) break
  }

  cachedProjectData = { at: now, key, items, iterationConfig }
  return { items, iterationConfig }
}

async function fetchProjectItems (
  token: string,
  project: ProjectRef
): Promise<ProjectItemSnapshot[]> {
  const { items } = await fetchProjectData(token, project)
  return items
}

export async function buildBigRockChartData (
  token: string,
  bigRock: GithubProjectBigRock,
  project = resolveGithubProjectRef()
): Promise<BigRockTaskChartPoint[]> {
  const items = await fetchProjectItems(token, project)
  return buildBigRockTaskMatrix(items, bigRock)
}

export async function countProjectItemsByStatusForBigRock (
  token: string,
  bigRock: GithubProjectBigRock,
  project = resolveGithubProjectRef()
): Promise<StatusCounts> {
  const items = await fetchProjectItems(token, project)
  return aggregateItemsByStatusForBigRock(items, bigRock)
}

export async function countProjectItemsByBigRock (
  token: string,
  filter: TicketStatusFilter,
  project = resolveGithubProjectRef()
): Promise<BigRockCounts> {
  const items = await fetchProjectItems(token, project)
  return aggregateItemsByBigRock(items, filter)
}

export function buildIterationReport (
  items: ProjectItemSnapshot[],
  iteration: ProjectIteration,
  locale = 'en'
): ActiveIterationReport {
  const list = buildTasksForIteration(items, iteration.iterationId)

  return {
    iteration,
    dateRange: formatIterationDateRange(iteration.startDate, iteration.duration, locale),
    ...list,
  }
}

function itemToSprintTask (item: ProjectItemSnapshot): ActiveIterationTask {
  return {
    title: item.title ?? 'Untitled',
    url: item.url,
    status: normalizeProjectStatus(item.status),
    bigRock: item.bigRock,
    typeOfTask: item.typeOfTask,
    priority: item.priority,
    size: item.size,
    assignees: item.assignees,
  }
}

function buildTasksForIteration (
  items: ProjectItemSnapshot[],
  iterationId: string
): SprintTaskListReport {
  const tasks: ActiveIterationTask[] = []
  const statusCounts = emptyStatusCounts()

  for (const item of items) {
    if (item.iteration?.iterationId !== iterationId) continue
    const task = itemToSprintTask(item)
    statusCounts[task.status] += 1
    tasks.push(task)
  }

  tasks.sort((a, b) => statusSortIndex(a.status) - statusSortIndex(b.status))

  return {
    tasks,
    statusCounts,
    total: tasks.length,
  }
}

export function buildUnscheduledOpenTasksReport (
  items: ProjectItemSnapshot[]
): SprintTaskListReport {
  const tasks: ActiveIterationTask[] = []
  const statusCounts = emptyStatusCounts()

  for (const item of items) {
    if (item.iteration) continue
    if (!matchesStatusFilter(item.status, 'open')) continue
    const task = itemToSprintTask(item)
    statusCounts[task.status] += 1
    tasks.push(task)
  }

  tasks.sort((a, b) => statusSortIndex(a.status) - statusSortIndex(b.status))

  return {
    tasks,
    statusCounts,
    total: tasks.length,
  }
}

function resolveActiveIterationFromData (
  items: ProjectItemSnapshot[],
  iterationConfig: ProjectIteration[]
): ProjectIteration | null {
  let activeIteration = resolveActiveIteration(iterationConfig)
  if (activeIteration) return activeIteration

  const activeFromItems = new Map<string, ProjectIteration>()
  for (const item of items) {
    if (item.iteration && isIterationActive(item.iteration)) {
      activeFromItems.set(item.iteration.iterationId, item.iteration)
    }
  }
  return activeFromItems.values().next().value ?? null
}

export function buildSprintReports (
  items: ProjectItemSnapshot[],
  iterationConfig: ProjectIteration[],
  locale = 'en'
): SprintReports {
  const activeIteration = resolveActiveIterationFromData(items, iterationConfig)
  const plannedIteration = resolvePlannedIteration(iterationConfig)
  const previousIteration = resolvePreviousIteration(iterationConfig)

  return {
    previous: previousIteration
      ? buildIterationReport(items, previousIteration, locale)
      : null,
    active: activeIteration ? buildIterationReport(items, activeIteration, locale) : null,
    planned: plannedIteration ? buildIterationReport(items, plannedIteration, locale) : null,
    unscheduled: buildUnscheduledOpenTasksReport(items),
  }
}

export function buildActiveIterationReport (
  items: ProjectItemSnapshot[],
  iterationConfig: ProjectIteration[],
  locale = 'en'
): ActiveIterationReport | null {
  return buildSprintReports(items, iterationConfig, locale).active
}

export async function fetchSprintReports (
  token: string,
  project = resolveGithubProjectRef(),
  locale = 'en'
): Promise<SprintReports> {
  const { items, iterationConfig } = await fetchProjectData(token, project)
  return buildSprintReports(items, iterationConfig, locale)
}

export async function fetchActiveIterationReport (
  token: string,
  project = resolveGithubProjectRef(),
  locale = 'en'
): Promise<ActiveIterationReport | null> {
  const reports = await fetchSprintReports(token, project, locale)
  return reports.active
}

const ASSIGNEE_CHART_LIMIT = 8
const UNASSIGNED_ASSIGNEE_KEY = '__unassigned__'
const OTHER_ASSIGNEE_KEY = '__other__'

function daysSince (isoDate: string, now = new Date()): number {
  const created = new Date(isoDate)
  const diffMs = now.getTime() - created.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

function classifySprintLevel (
  item: ProjectItemSnapshot,
  activeIterationId: string | null,
  plannedIterationId: string | null
): SprintLevelBucket {
  if (!item.iteration) return 'unscheduled'
  if (activeIterationId && item.iteration.iterationId === activeIterationId) return 'current'
  if (plannedIterationId && item.iteration.iterationId === plannedIterationId) return 'planned'
  return 'other'
}

function backlogAgeBucket (days: number): BacklogAgeBucket {
  if (days <= 7) return 'under_1w'
  if (days <= 14) return '1_2w'
  if (days <= 30) return '2_4w'
  return 'over_4w'
}

function buildAssigneeChartRows (counts: Map<string, number>): SprintAnalyticsChartRow[] {
  const entries = [...counts.entries()].sort((a, b) => b[1] - a[1])
  if (entries.length <= ASSIGNEE_CHART_LIMIT) {
    return entries.map(([key, count], index) => ({
      key,
      count,
      fill: SPRINT_ASSIGNEE_CHART_COLORS[index % SPRINT_ASSIGNEE_CHART_COLORS.length],
    }))
  }

  const head = entries.slice(0, ASSIGNEE_CHART_LIMIT - 1)
  const tail = entries.slice(ASSIGNEE_CHART_LIMIT - 1)
  const otherCount = tail.reduce((sum, [, count]) => sum + count, 0)

  const rows: SprintAnalyticsChartRow[] = head.map(([key, count], index) => ({
    key,
    count,
    fill: SPRINT_ASSIGNEE_CHART_COLORS[index % SPRINT_ASSIGNEE_CHART_COLORS.length],
  }))

  rows.push({
    key: OTHER_ASSIGNEE_KEY,
    count: otherCount,
    fill: SPRINT_ASSIGNEE_CHART_COLORS[(rows.length) % SPRINT_ASSIGNEE_CHART_COLORS.length],
  })

  return rows
}

export function buildSprintAnalytics (
  items: ProjectItemSnapshot[],
  iterationConfig: ProjectIteration[]
): SprintAnalytics {
  const activeIteration = resolveActiveIterationFromData(items, iterationConfig)
  const plannedIteration = resolvePlannedIteration(iterationConfig)
  const activeIterationId = activeIteration?.iterationId ?? null
  const plannedIterationId = plannedIteration?.iterationId ?? null
  const now = new Date()

  const sprintLevelCounts = Object.fromEntries(
    SPRINT_LEVEL_BUCKETS.map((bucket) => [bucket, 0])
  ) as Record<SprintLevelBucket, number>
  const assigneeCounts = new Map<string, number>()
  const backlogAgeCounts = Object.fromEntries(
    BACKLOG_AGE_BUCKETS.map((bucket) => [bucket, 0])
  ) as Record<BacklogAgeBucket, number>
  const p0Unassigned: P0UnassignedTaskRow[] = []

  let openTotal = 0
  let backlogTotal = 0

  for (const item of items) {
    const status = normalizeProjectStatus(item.status)
    const isOpen = matchesStatusFilter(item.status, 'open')
    if (isOpen) openTotal += 1
    if (status === GITHUB_PROJECT_STATUS_BACKLOG) backlogTotal += 1

    if (isOpen) {
      const sprintLevel = classifySprintLevel(item, activeIterationId, plannedIterationId)
      sprintLevelCounts[sprintLevel] += 1

      if (item.assignees.length) {
        for (const assignee of item.assignees) {
          assigneeCounts.set(assignee, (assigneeCounts.get(assignee) ?? 0) + 1)
        }
      } else {
        assigneeCounts.set(
          UNASSIGNED_ASSIGNEE_KEY,
          (assigneeCounts.get(UNASSIGNED_ASSIGNEE_KEY) ?? 0) + 1
        )
      }
    }

    if (status === GITHUB_PROJECT_STATUS_BACKLOG && item.createdAt) {
      const bucket = backlogAgeBucket(daysSince(item.createdAt, now))
      backlogAgeCounts[bucket] += 1
    }

    if (
      isOpen &&
      isP0ProjectPriority(item.priority) &&
      item.assignees.length === 0
    ) {
      p0Unassigned.push({
        title: item.title ?? 'Untitled',
        url: item.url,
        status,
        bigRock: item.bigRock,
        sprintLevel: classifySprintLevel(item, activeIterationId, plannedIterationId),
        daysOpen: item.createdAt ? daysSince(item.createdAt, now) : null,
        createdAt: item.createdAt,
      })
    }
  }

  p0Unassigned.sort((a, b) => (b.daysOpen ?? -1) - (a.daysOpen ?? -1))

  return {
    bySprintLevel: SPRINT_LEVEL_BUCKETS.map((key) => ({
      key,
      count: sprintLevelCounts[key],
      fill: SPRINT_LEVEL_CHART_COLORS[key],
    })),
    byAssignee: buildAssigneeChartRows(assigneeCounts),
    byBacklogAge: BACKLOG_AGE_BUCKETS.map((key) => ({
      key,
      count: backlogAgeCounts[key],
      fill: BACKLOG_AGE_CHART_COLORS[key],
    })),
    p0Unassigned,
    totals: {
      open: openTotal,
      backlog: backlogTotal,
    },
  }
}

export async function fetchSprintAnalytics (
  token: string,
  project = resolveGithubProjectRef()
): Promise<SprintAnalytics> {
  const { items, iterationConfig } = await fetchProjectData(token, project)
  return buildSprintAnalytics(items, iterationConfig)
}
