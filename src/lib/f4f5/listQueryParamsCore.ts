/** F4/F5 list query types and API URL parsing — safe for server handlers (no client SmartFilter). */

import type { CompletionMode } from './listGates'
import { parseCompletionMode } from './listGates'

export type SortDirection = 'asc' | 'desc'
export type { CompletionMode }

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
  localities: string[]
  grants: string[]
  reportStatuses: string[]
}

export type F5ListFilters = {
  grantIdText: string
  baseRooms: string[]
  states: string[]
  localities: string[]
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
  completion: CompletionMode
  filters: F4ListFilters
}

export type F5ListQuery = ListPaginationParams & {
  sortBy: F5SortKey
  sortDir: SortDirection
  completion: CompletionMode
  filters: F5ListFilters
}

export function needsReachForF5List(query: F5ListQuery): boolean {
  return query.filters.endActivityStatuses.length > 0 || query.sortBy === 'activities_count'
}

export function needsGrantMultiSelectForF4List(query: F4ListQuery): boolean {
  return query.filters.grants.length > 0
}

export function needsGrantMultiSelectForF5List(query: F5ListQuery): boolean {
  return query.filters.grants.length > 0
}

export function needsPlanBeforePaginateF4List(query: F4ListQuery): boolean {
  return query.sortBy === 'amount_sdg' || query.sortBy === 'total_grant'
}

export function needsPlanBeforePaginateF5List(query: F5ListQuery): boolean {
  return query.sortBy === 'amount_sdg'
}

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

export function parseMulti(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean)
  }
  if (value != null && String(value).trim() !== '') {
    return [String(value).trim()]
  }
  return []
}

export function clampPageSize(n: number): number {
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
  if (f.localities.length) p.set('locality', f.localities.join('|'))
  if (f.grants.length) p.set('grant', f.grants.join('|'))
  if (f.reportStatuses.length) p.set('report_status', f.reportStatuses.join('|'))
  if (query.completion !== 'all') p.set('completion', query.completion)
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
  if (f.localities.length) p.set('locality', f.localities.join('|'))
  if (f.grants.length) p.set('grant', f.grants.join('|'))
  if (f.reportStatuses.length) p.set('report_status', f.reportStatuses.join('|'))
  if (f.endActivityStatuses.length) p.set('end_activity_status', f.endActivityStatuses.join('|'))
  if (query.completion !== 'all') p.set('completion', query.completion)
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
    completion: parseCompletionMode(searchParams.get('completion')),
    filters: {
      grantIdText: String(searchParams.get('grant_id') ?? '').trim(),
      baseRooms: searchParams.get('base_room')?.split('|').filter(Boolean) ?? [],
      states: searchParams.get('state')?.split('|').filter(Boolean) ?? [],
      localities: searchParams.get('locality')?.split('|').filter(Boolean) ?? [],
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
    completion: parseCompletionMode(searchParams.get('completion')),
    filters: {
      grantIdText: String(searchParams.get('grant_id') ?? '').trim(),
      baseRooms: baseRoom ? baseRoom.split('|').filter(Boolean) : [],
      states: state ? state.split('|').filter(Boolean) : [],
      localities: searchParams.get('locality')?.split('|').filter(Boolean) ?? [],
      grants: grant ? grant.split('|').filter(Boolean) : [],
      reportStatuses: reportStatus ? reportStatus.split('|').filter(Boolean) : [],
      endActivityStatuses: endActivity ? endActivity.split('|').filter(Boolean) : [],
    },
  }
}
