/** Allowed issue labels in solema247/Mutual-Aid-Portal (must match GitHub). */
export const GITHUB_RAISE_TICKET_LABELS = [
  'bug',
  'portal-ui-major-fix',
  'portal-ui-minor-fix',
] as const

export type GithubRaiseTicketLabel = (typeof GITHUB_RAISE_TICKET_LABELS)[number]

export const RAISE_TICKET_PRIORITIES = ['P0', 'P1', 'P2', 'P3'] as const

export type RaiseTicketPriority = (typeof RAISE_TICKET_PRIORITIES)[number]

/** Inserted into GitHub issue description when portal sends priority. */
export const PRIORITY_TO_DESCRIPTION_LINE: Record<RaiseTicketPriority, string> = {
  P0: 'P0 – Urgent',
  P1: 'P1 – Must Have',
  P2: 'P2 – Good to Have',
  P3: 'P3 – Unsure',
}

export const RAISE_TICKET_LABEL_I18N_KEYS: Record<GithubRaiseTicketLabel, string> = {
  bug: 'raise_ticket_label_bug',
  'portal-ui-major-fix': 'raise_ticket_label_major',
  'portal-ui-minor-fix': 'raise_ticket_label_minor',
}

/** GitHub Project v2 single-select field: Big Rock */
export const GITHUB_PROJECT_BIG_ROCKS = [
  'System Enhancements',
  'Expand Access',
  'Localization',
  'Safeguard System Operations',
] as const

export const GITHUB_PROJECT_BIG_ROCK_NOT_SET = 'Not set' as const

export type GithubProjectBigRock =
  | (typeof GITHUB_PROJECT_BIG_ROCKS)[number]
  | typeof GITHUB_PROJECT_BIG_ROCK_NOT_SET

export type TicketsByBigRockChartRow = {
  bigRock: GithubProjectBigRock
  count: number
  fill: string
}

export const GITHUB_PROJECT_BIG_ROCK_CHART_ORDER: GithubProjectBigRock[] = [
  ...GITHUB_PROJECT_BIG_ROCKS,
  GITHUB_PROJECT_BIG_ROCK_NOT_SET,
]

/** Pastel palette for ticket dashboard charts (no yellow/orange). */
export const TICKET_CHART_PASTELS = {
  mint: '#9ee6c2',
  sky: '#a8d4f0',
  lavender: '#c4b5e8',
  rose: '#e8b4d4',
  teal: '#8ecec4',
  periwinkle: '#b5c7eb',
  muted: '#c8ccd4',
} as const

export const BIG_ROCK_CHART_COLORS: string[] = [
  TICKET_CHART_PASTELS.mint,
  TICKET_CHART_PASTELS.sky,
  TICKET_CHART_PASTELS.lavender,
  TICKET_CHART_PASTELS.rose,
  TICKET_CHART_PASTELS.muted,
]

export const RAISE_TICKET_BIG_ROCK_I18N_KEYS: Record<GithubProjectBigRock, string> = {
  'System Enhancements': 'raise_ticket_big_rock_system',
  'Expand Access': 'raise_ticket_big_rock_expand_access',
  Localization: 'raise_ticket_big_rock_localization',
  'Safeguard System Operations': 'raise_ticket_big_rock_safeguard',
  'Not set': 'raise_ticket_big_rock_not_set',
}

/** Shorter labels for compact dashboard charts (4-column layout). */
export const RAISE_TICKET_BIG_ROCK_SHORT_I18N_KEYS: Record<GithubProjectBigRock, string> = {
  'System Enhancements': 'raise_ticket_big_rock_short_system',
  'Expand Access': 'raise_ticket_big_rock_short_expand_access',
  Localization: 'raise_ticket_big_rock_short_localization',
  'Safeguard System Operations': 'raise_ticket_big_rock_short_safeguard',
  'Not set': 'raise_ticket_big_rock_short_not_set',
}

export function bigRockChartColor (index: number): string {
  return BIG_ROCK_CHART_COLORS[index % BIG_ROCK_CHART_COLORS.length]
}

export const SPRINT_LEVEL_BUCKETS = [
  'current',
  'planned',
  'unscheduled',
  'other',
] as const

export type SprintLevelBucket = (typeof SPRINT_LEVEL_BUCKETS)[number]

export const SPRINT_LEVEL_CHART_COLORS: Record<SprintLevelBucket, string> = {
  current: TICKET_CHART_PASTELS.mint,
  planned: TICKET_CHART_PASTELS.sky,
  unscheduled: TICKET_CHART_PASTELS.lavender,
  other: TICKET_CHART_PASTELS.muted,
}

export const BACKLOG_AGE_BUCKETS = [
  'under_1w',
  '1_2w',
  '2_4w',
  'over_4w',
] as const

export type BacklogAgeBucket = (typeof BACKLOG_AGE_BUCKETS)[number]

export const BACKLOG_AGE_CHART_COLORS: Record<BacklogAgeBucket, string> = {
  under_1w: TICKET_CHART_PASTELS.mint,
  '1_2w': TICKET_CHART_PASTELS.sky,
  '2_4w': TICKET_CHART_PASTELS.lavender,
  over_4w: TICKET_CHART_PASTELS.rose,
}

export const SPRINT_ASSIGNEE_CHART_COLORS = [
  TICKET_CHART_PASTELS.mint,
  TICKET_CHART_PASTELS.sky,
  TICKET_CHART_PASTELS.lavender,
  TICKET_CHART_PASTELS.teal,
  TICKET_CHART_PASTELS.periwinkle,
  TICKET_CHART_PASTELS.rose,
  TICKET_CHART_PASTELS.muted,
] as const

export function isP0ProjectPriority (priority: string | null): boolean {
  if (!priority) return false
  const normalized = priority.trim()
  return /^P0\b/i.test(normalized) || normalized.startsWith('P0')
}

/** GitHub Project v2 built-in Status field options */
export const GITHUB_PROJECT_STATUS_BACKLOG = 'Backlog' as const
export const GITHUB_PROJECT_STATUS_READY = 'Ready' as const
export const GITHUB_PROJECT_STATUS_IN_PROGRESS = 'In progress' as const
export const GITHUB_PROJECT_STATUS_DONE = 'Done' as const

export const GITHUB_PROJECT_OPEN_STATUSES = [
  GITHUB_PROJECT_STATUS_BACKLOG,
  GITHUB_PROJECT_STATUS_READY,
  GITHUB_PROJECT_STATUS_IN_PROGRESS,
] as const

export type GithubProjectStatus =
  | typeof GITHUB_PROJECT_STATUS_BACKLOG
  | typeof GITHUB_PROJECT_STATUS_READY
  | typeof GITHUB_PROJECT_STATUS_IN_PROGRESS
  | typeof GITHUB_PROJECT_STATUS_DONE

export const GITHUB_PROJECT_STATUS_CHART_ORDER: GithubProjectStatus[] = [
  GITHUB_PROJECT_STATUS_BACKLOG,
  GITHUB_PROJECT_STATUS_READY,
  GITHUB_PROJECT_STATUS_IN_PROGRESS,
  GITHUB_PROJECT_STATUS_DONE,
]

export const GITHUB_PROJECT_SYSTEM_ENHANCEMENTS = 'System Enhancements' as const

export function normalizeProjectStatus (status: string | null): GithubProjectStatus {
  if (
    status != null &&
    (GITHUB_PROJECT_STATUS_CHART_ORDER as readonly string[]).includes(status)
  ) {
    return status as GithubProjectStatus
  }
  return GITHUB_PROJECT_STATUS_BACKLOG
}

/** Type of Task values grouped by Big Rock (for explainer and canonical ordering). */
export const BIG_ROCK_TASK_TYPES: Record<(typeof GITHUB_PROJECT_BIG_ROCKS)[number], readonly string[]> = {
  'System Enhancements': [
    'Data Issue or Bug',
    'Portal UI Minor Fix',
    'Portal Major Upgrade',
  ],
  'Expand Access': ['Expand Access (Planning)', 'Expand Access (Training)'],
  Localization: ['Localization'],
  'Safeguard System Operations': ['Safeguard System (Planning)'],
}

/** All known Type of Task options (canonical sort order for charts). */
export const GITHUB_PROJECT_ALL_TASK_TYPES = [
  'Data Issue or Bug',
  'Portal UI Minor Fix',
  'Portal Major Upgrade',
  'Expand Access (Planning)',
  'Expand Access (Training)',
  'Safeguard System (Planning)',
  'Localization',
] as const

export const STATUS_DATA_KEYS = {
  Backlog: 'backlog',
  Ready: 'ready',
  'In progress': 'inProgress',
  Done: 'done',
} as const

export type StatusDataKey = (typeof STATUS_DATA_KEYS)[GithubProjectStatus]

export const STATUS_SERIES: StatusDataKey[] = [
  'backlog',
  'ready',
  'inProgress',
  'done',
]

export const STATUS_CHART_COLORS: Record<StatusDataKey, string> = {
  backlog: TICKET_CHART_PASTELS.mint,
  ready: TICKET_CHART_PASTELS.sky,
  inProgress: TICKET_CHART_PASTELS.lavender,
  done: TICKET_CHART_PASTELS.teal,
}

export const RAISE_TICKET_STATUS_I18N_KEYS: Record<GithubProjectStatus, string> = {
  Backlog: 'raise_ticket_status_backlog',
  Ready: 'raise_ticket_status_ready',
  'In progress': 'raise_ticket_status_in_progress',
  Done: 'raise_ticket_status_done',
}

export const RAISE_TICKET_STATUS_SHORT_I18N_KEYS: Record<GithubProjectStatus, string> = {
  Backlog: 'raise_ticket_status_short_backlog',
  Ready: 'raise_ticket_status_short_ready',
  'In progress': 'raise_ticket_status_short_in_progress',
  Done: 'raise_ticket_status_short_done',
}

/** Grouped bar chart: X-axis = Type of Task (per Big Rock), bars = Status */
export type BigRockTaskChartPoint = {
  taskTypeKey: string
  taskTypeLabel: string
} & Record<StatusDataKey, number>

export const RAISE_TICKET_TASK_TYPE_I18N_KEYS: Record<string, string> = {
  'Data Issue or Bug': 'raise_ticket_task_data_bug',
  'Portal UI Minor Fix': 'raise_ticket_task_portal_minor',
  'Portal Major Upgrade': 'raise_ticket_task_portal_major',
  'Expand Access (Planning)': 'raise_ticket_task_expand_planning',
  'Expand Access (Training)': 'raise_ticket_task_expand_training',
  'Safeguard System (Planning)': 'raise_ticket_task_safeguard_planning',
  Localization: 'raise_ticket_task_localization',
}

export const RAISE_TICKET_TASK_TYPE_SHORT_I18N_KEYS: Record<string, string> = {
  'Data Issue or Bug': 'raise_ticket_task_short_data_bug',
  'Portal UI Minor Fix': 'raise_ticket_task_short_portal_minor',
  'Portal Major Upgrade': 'raise_ticket_task_short_portal_major',
  'Expand Access (Planning)': 'raise_ticket_task_short_expand_planning',
  'Expand Access (Training)': 'raise_ticket_task_short_expand_training',
  'Safeguard System (Planning)': 'raise_ticket_task_short_safeguard_planning',
  Localization: 'raise_ticket_task_short_localization',
}

export function taskTypeToChartKey (taskType: string): string {
  return taskType
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
}

export function statusChartColor (index: number): string {
  return STATUS_SERIES.map((key) => STATUS_CHART_COLORS[key])[index % STATUS_SERIES.length]
}

export type TicketStatusFilter = 'open' | 'closed'

export const DEFAULT_TICKET_STATUS_FILTER: TicketStatusFilter = 'open'

export const DEFAULT_GITHUB_ISSUES_REPO = 'solema247/Mutual-Aid-Portal'
