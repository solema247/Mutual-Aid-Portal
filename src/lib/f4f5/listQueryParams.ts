import { parseFiltersFromSearchParams } from '@/components/smart-filter/SmartFilter'
import { getF4ReportingFilterFields, getF5ReportingFilterFields } from '@/components/smart-filter/filter-config'
import type { FilterSelectOption } from '@/components/smart-filter/types'

export type SortDirection = 'asc' | 'desc'

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

export type F4SortKey =
  | 'base_room_name'
  | 'grant'
  | 'state'
  | 'donor'
  | 'payment_date'
  | 'amount_sdg'
  | 'exchange_rate'
  | 'report_date'
  | 'total_grant'
  | 'total_expenses'
  | 'remainder'

export type F5SortKey =
  | 'base_room_name'
  | 'grant'
  | 'state'
  | 'donor'
  | 'payment_date'
  | 'amount_sdg'
  | 'exchange_rate'
  | 'report_date'
  | 'activities_count'
  | 'updated_at'

export type F4ListFilters = {
  grantIdText: string
  baseRooms: string[]
  states: string[]
  grants: string[]
  reportStatuses: string[]
}

export type F5ListFilters = {
  grantIdText: string
  baseRooms: string[]
  states: string[]
  grants: string[]
  reportStatuses: string[]
  endActivityStatuses: string[]
}

export type ListPaginationParams = {
  page: number
  pageSize: number
}

export type F4ListQuery = ListPaginationParams & {
  sortBy: F4SortKey
  sortDir: SortDirection
  filters: F4ListFilters
}

export type F5ListQuery = ListPaginationParams & {
  sortBy: F5SortKey
  sortDir: SortDirection
  filters: F5ListFilters
}

/** Path B when end-activity filter or activities_count sort requires reach before paginate. */
export function needsReachForF5List(query: F5ListQuery): boolean {
  return query.filters.endActivityStatuses.length > 0 || query.sortBy === 'activities_count'
}

/** Path B when grant multi-select requires grant_call_id before paginate. */
export function needsGrantMultiSelectForF4List(query: F4ListQuery): boolean {
  return query.filters.grants.length > 0
}

export function needsGrantMultiSelectForF5List(query: F5ListQuery): boolean {
  return query.filters.grants.length > 0
}

/** Path B when plan-derived sort requires financial fields before paginate. */
export function needsPlanBeforePaginateF4List(query: F4ListQuery): boolean {
  return query.sortBy === 'amount_sdg' || query.sortBy === 'total_grant'
}

export function needsPlanBeforePaginateF5List(query: F5ListQuery): boolean {
  return query.sortBy === 'amount_sdg'
}

/** Path B when payment-derived sort requires MOU maps before paginate. */
export function needsPaymentBeforePaginateF4List(query: F4ListQuery): boolean {
  return (
    query.sortBy === 'payment_date' ||
    query.sortBy === 'exchange_rate' ||
    query.sortBy === 'amount_sdg'
  )
}

export function needsPaymentBeforePaginateF5List(query: F5ListQuery): boolean {
  return (
    query.sortBy === 'payment_date' ||
    query.sortBy === 'exchange_rate' ||
    query.sortBy === 'amount_sdg'
  )
}

function parseMulti(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }
  if (value != null && String(value).trim() !== '') {
    return [String(value).trim()]
  }
  return []
}

function clampPageSize(n: number): number {
  if (!Number.isFinite(n) || n < 1) return 20
  if ((PAGE_SIZE_OPTIONS as readonly number[]).includes(n)) return n
  if (n <= 10) return 10
  if (n <= 20) return 20
  if (n <= 50) return 50
  return 100
}

const F4_SORT_KEYS = new Set<string>([
  'base_room_name',
  'grant',
  'state',
  'donor',
  'payment_date',
  'amount_sdg',
  'exchange_rate',
  'report_date',
  'total_grant',
  'total_expenses',
  'remainder',
])

const F5_SORT_KEYS = new Set<string>([
  'base_room_name',
  'grant',
  'state',
  'donor',
  'payment_date',
  'amount_sdg',
  'exchange_rate',
  'report_date',
  'activities_count',
  'updated_at',
])

/** Minimal field configs for parsing f4f_/f5f_ URL params (options not needed). */
const F4_PARSE_FIELDS = getF4ReportingFilterFields({
  baseRoomOptions: [],
  stateOptions: [],
  grantOptions: [] as FilterSelectOption[],
  reportStatusOptions: [],
  labels: {
    grantId: '',
    grantIdPlaceholder: '',
    baseRoom: '',
    state: '',
    grant: '',
    reportStatus: '',
    all: '',
  },
})

const F5_PARSE_FIELDS = getF5ReportingFilterFields({
  baseRoomOptions: [],
  stateOptions: [],
  grantOptions: [] as FilterSelectOption[],
  reportStatusOptions: [],
  endActivityStatusOptions: [],
  labels: {
    grantId: '',
    grantIdPlaceholder: '',
    baseRoom: '',
    state: '',
    grant: '',
    reportStatus: '',
    endActivityStatus: '',
    all: '',
  },
})

function filtersFromUrl(searchParams: URLSearchParams, prefix: string, fields: typeof F4_PARSE_FIELDS): Record<string, unknown> {
  return parseFiltersFromSearchParams(searchParams, prefix, fields)
}

export function parseF4ListQuery(searchParams: URLSearchParams): F4ListQuery {
  const page = Math.max(1, parseInt(searchParams.get('f4p_page') || '1', 10) || 1)
  const pageSize = clampPageSize(parseInt(searchParams.get('f4p_pageSize') || '20', 10) || 20)
  const sortByRaw = searchParams.get('f4p_sortBy') || 'report_date'
  const sortBy = (F4_SORT_KEYS.has(sortByRaw) ? sortByRaw : 'report_date') as F4SortKey
  const sortDirRaw = searchParams.get('f4p_sortDir') || 'desc'
  const sortDir: SortDirection = sortDirRaw === 'asc' ? 'asc' : 'desc'

  const fromUrl = filtersFromUrl(searchParams, 'f4f_', F4_PARSE_FIELDS)

  return {
    page,
    pageSize,
    sortBy,
    sortDir,
    filters: {
      grantIdText: String(fromUrl.grant_id ?? '').trim(),
      baseRooms: parseMulti(fromUrl.base_room),
      states: parseMulti(fromUrl.state),
      grants: parseMulti(fromUrl.grant),
      reportStatuses: parseMulti(fromUrl.report_status),
    },
  }
}

export function parseF5ListQuery(searchParams: URLSearchParams): F5ListQuery {
  const page = Math.max(1, parseInt(searchParams.get('f5p_page') || '1', 10) || 1)
  const pageSize = clampPageSize(parseInt(searchParams.get('f5p_pageSize') || '20', 10) || 20)
  const sortByRaw = searchParams.get('f5p_sortBy') || 'report_date'
  const sortBy = (F5_SORT_KEYS.has(sortByRaw) ? sortByRaw : 'report_date') as F5SortKey
  const sortDirRaw = searchParams.get('f5p_sortDir') || 'desc'
  const sortDir: SortDirection = sortDirRaw === 'asc' ? 'asc' : 'desc'

  const fromUrl = filtersFromUrl(searchParams, 'f5f_', F5_PARSE_FIELDS)

  return {
    page,
    pageSize,
    sortBy,
    sortDir,
    filters: {
      grantIdText: String(fromUrl.grant_id ?? '').trim(),
      baseRooms: parseMulti(fromUrl.base_room),
      states: parseMulti(fromUrl.state),
      grants: parseMulti(fromUrl.grant),
      reportStatuses: parseMulti(fromUrl.report_status),
      endActivityStatuses: parseMulti(fromUrl.end_activity_status),
    },
  }
}

export function buildF4ListSearchParams(query: F4ListQuery): string {
  const p = new URLSearchParams()
  p.set('page', String(query.page))
  p.set('pageSize', String(query.pageSize))
  p.set('sortBy', query.sortBy)
  p.set('sortDir', query.sortDir)
  const f = query.filters
  if (f.grantIdText) p.set('grant_id', f.grantIdText)
  if (f.baseRooms.length) p.set('base_room', f.baseRooms.join('|'))
  if (f.states.length) p.set('state', f.states.join('|'))
  if (f.grants.length) p.set('grant', f.grants.join('|'))
  if (f.reportStatuses.length) p.set('report_status', f.reportStatuses.join('|'))
  return p.toString()
}

export function buildF5ListSearchParams(query: F5ListQuery): string {
  const p = new URLSearchParams()
  p.set('page', String(query.page))
  p.set('pageSize', String(query.pageSize))
  p.set('sortBy', query.sortBy)
  p.set('sortDir', query.sortDir)
  const f = query.filters
  if (f.grantIdText) p.set('grant_id', f.grantIdText)
  if (f.baseRooms.length) p.set('base_room', f.baseRooms.join('|'))
  if (f.states.length) p.set('state', f.states.join('|'))
  if (f.grants.length) p.set('grant', f.grants.join('|'))
  if (f.reportStatuses.length) p.set('report_status', f.reportStatuses.join('|'))
  if (f.endActivityStatuses.length) p.set('end_activity_status', f.endActivityStatuses.join('|'))
  return p.toString()
}

export function parseF4ListQueryFromApiUrl(searchParams: URLSearchParams): F4ListQuery {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const pageSize = clampPageSize(parseInt(searchParams.get('pageSize') || '20', 10) || 20)
  const sortByRaw = searchParams.get('sortBy') || 'report_date'
  const sortBy = (F4_SORT_KEYS.has(sortByRaw) ? sortByRaw : 'report_date') as F4SortKey
  const sortDirRaw = searchParams.get('sortDir') || 'desc'
  const sortDir: SortDirection = sortDirRaw === 'asc' ? 'asc' : 'desc'

  return {
    page,
    pageSize,
    sortBy,
    sortDir,
    filters: {
      grantIdText: String(searchParams.get('grant_id') ?? '').trim(),
      baseRooms: searchParams.get('base_room')?.split('|').filter(Boolean) ?? [],
      states: searchParams.get('state')?.split('|').filter(Boolean) ?? [],
      grants: searchParams.get('grant')?.split('|').filter(Boolean) ?? [],
      reportStatuses: searchParams.get('report_status')?.split('|').filter(Boolean) ?? [],
    },
  }
}

export function parseF5ListQueryFromApiUrl(searchParams: URLSearchParams): F5ListQuery {
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1)
  const pageSize = clampPageSize(parseInt(searchParams.get('pageSize') || '20', 10) || 20)
  const sortByRaw = searchParams.get('sortBy') || 'report_date'
  const sortBy = (F5_SORT_KEYS.has(sortByRaw) ? sortByRaw : 'report_date') as F5SortKey
  const sortDirRaw = searchParams.get('sortDir') || 'desc'
  const sortDir: SortDirection = sortDirRaw === 'asc' ? 'asc' : 'desc'

  const baseRoom = searchParams.get('base_room')
  const state = searchParams.get('state')
  const grant = searchParams.get('grant')
  const reportStatus = searchParams.get('report_status')
  const endActivity = searchParams.get('end_activity_status')

  return {
    page,
    pageSize,
    sortBy,
    sortDir,
    filters: {
      grantIdText: String(searchParams.get('grant_id') ?? '').trim(),
      baseRooms: baseRoom ? baseRoom.split('|').filter(Boolean) : [],
      states: state ? state.split('|').filter(Boolean) : [],
      grants: grant ? grant.split('|').filter(Boolean) : [],
      reportStatuses: reportStatus ? reportStatus.split('|').filter(Boolean) : [],
      endActivityStatuses: endActivity ? endActivity.split('|').filter(Boolean) : [],
    },
  }
}
