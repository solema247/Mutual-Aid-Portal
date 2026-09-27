import type { F4ListFilters, F5ListFilters, F4SortKey, F5SortKey, SortDirection } from './listQueryParams'
import { grantSearchTexts } from './listCommon'
import { buildLocationFilterMeta } from './locationFilterMeta'

function compareNullableValues(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0
  if (a == null) return 1
  if (b == null) return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
}

function grantIdTableText(r: { grant_serial_id?: string | null; grant_id?: string | null }) {
  const v = r.grant_serial_id ?? r.grant_id
  if (v == null || String(v).trim() === '') return '-'
  return String(v).trim()
}

export function applyF4ListFilters<T extends {
  grant_serial_id?: string | null
  grant_id?: string | null
  base_room_name?: string | null
  state?: string | null
  locality?: string | null
  grant_call_id?: string | null
  report_status?: string | null
}>(rows: T[], filters: F4ListFilters): T[] {
  let result = rows
  if (filters.grantIdText) {
    const term = filters.grantIdText.toLowerCase()
    result = result.filter((r) =>
      grantSearchTexts(r).some((s) => s.startsWith(term) || s.includes(term))
    )
  }
  if (filters.baseRooms.length) {
    const set = new Set(filters.baseRooms.map((s) => s.toLowerCase()))
    result = result.filter((r) => {
      const v = (r.base_room_name ?? '').trim().toLowerCase()
      return v && set.has(v)
    })
  }
  if (filters.states.length) {
    const set = new Set(filters.states.map((s) => s.toLowerCase()))
    result = result.filter((r) => {
      const v = (r.state ?? '').trim().toLowerCase()
      return v && set.has(v)
    })
  }
  if (filters.localities.length) {
    const set = new Set(filters.localities.map((s) => s.toLowerCase()))
    result = result.filter((r) => {
      const v = (r.locality ?? '').trim().toLowerCase()
      return v && set.has(v)
    })
  }
  if (filters.grants.length) {
    result = applyGrantMultiSelectListFilters(result, filters.grants)
  }
  if (filters.reportStatuses.length) {
    const set = new Set(filters.reportStatuses.map((s) => s.toLowerCase()))
    result = result.filter((r) => set.has(String(r.report_status ?? '').toLowerCase()))
  }
  return result
}

export function applyGrantMultiSelectListFilters<T extends { grant_call_id?: string | null }>(
  rows: T[],
  grantValues: string[]
): T[] {
  if (!grantValues.length) return rows
  const set = new Set(grantValues.map((s) => s.trim()))
  return rows.filter((r) => {
    const v = r.grant_call_id != null ? String(r.grant_call_id).trim() : ''
    return v && set.has(v)
  })
}

export function applyF4NonGrantMultiSelectListFilters<
  T extends {
    grant_serial_id?: string | null
    grant_id?: string | null
    base_room_name?: string | null
    state?: string | null
    grant_call_id?: string | null
    report_status?: string | null
  },
>(rows: T[], filters: F4ListFilters): T[] {
  return applyF4ListFilters(rows, { ...filters, grants: [] })
}

export function applyF5ListFilters<T extends {
  grant_serial_id?: string | null
  grant_id?: string | null
  base_room_name?: string | null
  state?: string | null
  locality?: string | null
  grant_call_id?: string | null
  report_status?: string | null
  end_activity_status?: string | null
}>(rows: T[], filters: F5ListFilters): T[] {
  let result = rows
  if (filters.grantIdText) {
    const term = filters.grantIdText.toLowerCase()
    result = result.filter((r) =>
      grantSearchTexts(r).some((s) => s.startsWith(term) || s.includes(term))
    )
  }
  if (filters.baseRooms.length) {
    const set = new Set(filters.baseRooms.map((s) => s.toLowerCase()))
    result = result.filter((r) => {
      const v = (r.base_room_name ?? '').trim().toLowerCase()
      return v && set.has(v)
    })
  }
  if (filters.states.length) {
    const set = new Set(filters.states.map((s) => s.toLowerCase()))
    result = result.filter((r) => {
      const v = (r.state ?? '').trim().toLowerCase()
      return v && set.has(v)
    })
  }
  if (filters.localities.length) {
    const set = new Set(filters.localities.map((s) => s.toLowerCase()))
    result = result.filter((r) => {
      const v = (r.locality ?? '').trim().toLowerCase()
      return v && set.has(v)
    })
  }
  if (filters.grants.length) {
    result = applyGrantMultiSelectListFilters(result, filters.grants)
  }
  if (filters.reportStatuses.length) {
    const set = new Set(filters.reportStatuses.map((s) => s.toLowerCase()))
    result = result.filter((r) => set.has(String(r.report_status ?? '').toLowerCase()))
  }
  if (filters.endActivityStatuses.length) {
    result = applyF5EndActivityListFilters(result, filters.endActivityStatuses)
  }
  return result
}

export function applyF5NonGrantMultiSelectListFilters<
  T extends {
    grant_serial_id?: string | null
    grant_id?: string | null
    base_room_name?: string | null
    state?: string | null
    grant_call_id?: string | null
    report_status?: string | null
    end_activity_status?: string | null
  },
>(rows: T[], filters: F5ListFilters): T[] {
  return applyF5ListFilters(rows, { ...filters, grants: [] })
}

export function applyF5NonReachListFilters<
  T extends {
    grant_serial_id?: string | null
    grant_id?: string | null
    base_room_name?: string | null
    state?: string | null
    grant_call_id?: string | null
    report_status?: string | null
    end_activity_status?: string | null
  },
>(rows: T[], filters: F5ListFilters): T[] {
  return applyF5ListFilters(rows, { ...filters, endActivityStatuses: [] })
}

export function applyF5EndActivityListFilters<T extends { end_activity_status?: string | null }>(
  rows: T[],
  endActivityStatuses: string[]
): T[] {
  if (!endActivityStatuses.length) return rows
  const set = new Set(endActivityStatuses.map((s) => s.toLowerCase()))
  return rows.filter((r) => {
    const v = r.end_activity_status != null ? String(r.end_activity_status).toLowerCase() : ''
    return v && set.has(v)
  })
}

export function sortF4Rows<T extends {
  base_room_name?: string | null
  err_id?: string | null
  grant_serial_id?: string | null
  grant_id?: string | null
  state?: string | null
  donor?: string | null
  payment_date?: string | null
  amount_sdg?: number | null
  exchange_rate?: number | null
  report_date?: string | null
  total_grant?: number | null
  total_expenses?: number | null
  remainder?: number | null
}>(rows: T[], sortBy: F4SortKey, sortDir: SortDirection): T[] {
  const factor = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const pick = (r: T) => {
      if (sortBy === 'base_room_name') return r.base_room_name ?? r.err_id ?? null
      if (sortBy === 'grant') return grantIdTableText(r)
      if (sortBy === 'state') return r.state ?? null
      if (sortBy === 'donor') return r.donor ?? null
      if (sortBy === 'payment_date') return r.payment_date ? new Date(r.payment_date).getTime() : null
      if (sortBy === 'amount_sdg') return r.amount_sdg ?? null
      if (sortBy === 'exchange_rate') return r.exchange_rate ?? null
      if (sortBy === 'report_date') return r.report_date ? new Date(r.report_date).getTime() : null
      if (sortBy === 'total_grant') return r.total_grant ?? null
      if (sortBy === 'total_expenses') return r.total_expenses ?? null
      return r.remainder ?? null
    }
    return compareNullableValues(pick(a), pick(b)) * factor
  })
}

export function sortF5Rows<T extends {
  base_room_name?: string | null
  err_id?: string | null
  grant_serial_id?: string | null
  grant_id?: string | null
  state?: string | null
  donor?: string | null
  payment_date?: string | null
  amount_sdg?: number | null
  exchange_rate?: number | null
  report_date?: string | null
  activities_count?: number
  updated_at?: string | null
}>(rows: T[], sortBy: F5SortKey, sortDir: SortDirection): T[] {
  const factor = sortDir === 'asc' ? 1 : -1
  return [...rows].sort((a, b) => {
    const pick = (r: T) => {
      if (sortBy === 'base_room_name') return r.base_room_name ?? r.err_id ?? null
      if (sortBy === 'grant') return grantIdTableText(r)
      if (sortBy === 'state') return r.state ?? null
      if (sortBy === 'donor') return r.donor ?? null
      if (sortBy === 'payment_date') return r.payment_date ? new Date(r.payment_date).getTime() : null
      if (sortBy === 'amount_sdg') return r.amount_sdg ?? null
      if (sortBy === 'exchange_rate') return r.exchange_rate ?? null
      if (sortBy === 'report_date') return r.report_date ? new Date(r.report_date).getTime() : null
      if (sortBy === 'activities_count') return Number(r.activities_count || 0)
      return r.updated_at ? new Date(r.updated_at).getTime() : null
    }
    return compareNullableValues(pick(a), pick(b)) * factor
  })
}

export function paginateRows<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize
  return rows.slice(start, start + pageSize)
}

export function paginationMeta(total: number, page: number, pageSize: number) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    hasNextPage: safePage < totalPages,
    hasPreviousPage: safePage > 1,
  }
}

export function buildFilterMeta(rows: {
  base_room_name?: string | null
  state?: string | null
  locality?: string | null
  grant_call_id?: string | null
}[]) {
  const baseRooms = new Set<string>()
  const states = new Set<string>()
  const grants = new Set<string>()
  for (const r of rows) {
    if (r.base_room_name) baseRooms.add(String(r.base_room_name))
    if (r.state) states.add(String(r.state))
    const g = r.grant_call_id != null ? String(r.grant_call_id).trim() : ''
    if (g) grants.add(g)
  }
  const location = buildLocationFilterMeta(rows)
  return {
    baseRooms: Array.from(baseRooms).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    states: Array.from(states).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })),
    grants: Array.from(grants)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((value) => ({ value, label: value })),
    localities: location.localities,
    rooms: location.rooms,
  }
}
