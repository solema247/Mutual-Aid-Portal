export * from './listQueryParamsCore'

import { parseFiltersFromSearchParams } from '@/components/smart-filter/SmartFilter'
import { getF4ReportingFilterFields, getF5ReportingFilterFields } from '@/components/smart-filter/filter-config'
import type { FilterSelectOption } from '@/components/smart-filter/types'
import {
  clampPageSize,
  parseMulti,
  type F4ListQuery,
  type F4SortKey,
  type F5ListQuery,
  type F5SortKey,
  type SortDirection,
} from './listQueryParamsCore'
import { parseCompletionMode } from './listGates'

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

const F4_PARSE_FIELDS = getF4ReportingFilterFields({
  baseRoomOptions: [],
  localityOptions: [],
  stateOptions: [],
  grantOptions: [] as FilterSelectOption[],
  reportStatusOptions: [],
  completionOptions: [],
  labels: {
    grantId: '',
    grantIdPlaceholder: '',
    baseRoom: '',
    locality: '',
    localitySelectStateFirst: '',
    state: '',
    grant: '',
    reportStatus: '',
    completion: '',
    completionActive: '',
    completionCompleted: '',
    completionAll: '',
    all: '',
  },
})

const F5_PARSE_FIELDS = getF5ReportingFilterFields({
  baseRoomOptions: [],
  localityOptions: [],
  stateOptions: [],
  grantOptions: [] as FilterSelectOption[],
  reportStatusOptions: [],
  endActivityStatusOptions: [],
  completionOptions: [],
  labels: {
    grantId: '',
    grantIdPlaceholder: '',
    baseRoom: '',
    locality: '',
    localitySelectStateFirst: '',
    state: '',
    grant: '',
    reportStatus: '',
    endActivityStatus: '',
    completion: '',
    completionActive: '',
    completionCompleted: '',
    completionAll: '',
    all: '',
  },
})

function filtersFromUrl(
  searchParams: URLSearchParams,
  prefix: string,
  fields: typeof F4_PARSE_FIELDS
): Record<string, unknown> {
  return parseFiltersFromSearchParams(searchParams, prefix, fields)
}

/** Parse F4 list state from browser URL (f4p_ / f4f_ params). Client-only helper. */
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
    completion: parseCompletionMode(
      fromUrl.completion != null && String(fromUrl.completion).trim() !== ''
        ? String(fromUrl.completion)
        : searchParams.get('f4f_completion')
    ),
    filters: {
      grantIdText: String(fromUrl.grant_id ?? '').trim(),
      baseRooms: parseMulti(fromUrl.base_room),
      states: parseMulti(fromUrl.state),
      localities: parseMulti(fromUrl.locality),
      grants: parseMulti(fromUrl.grant),
      reportStatuses: parseMulti(fromUrl.report_status),
    },
  }
}

/** Parse F5 list state from browser URL (f5p_ / f5f_ params). Client-only helper. */
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
    completion: parseCompletionMode(
      fromUrl.completion != null && String(fromUrl.completion).trim() !== ''
        ? String(fromUrl.completion)
        : searchParams.get('f5f_completion')
    ),
    filters: {
      grantIdText: String(fromUrl.grant_id ?? '').trim(),
      baseRooms: parseMulti(fromUrl.base_room),
      states: parseMulti(fromUrl.state),
      localities: parseMulti(fromUrl.locality),
      grants: parseMulti(fromUrl.grant),
      reportStatuses: parseMulti(fromUrl.report_status),
      endActivityStatuses: parseMulti(fromUrl.end_activity_status),
    },
  }
}
