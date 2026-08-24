import type { ActiveFilter } from '@/components/smart-filter/types'

export type PoolSliceFilters = {
  decisionId: string
  dateFrom: string
  dateTo: string
  partners: string[]
  restrictions: string[]
  grants: string[]
  states: string[]
}

export type PoolByStateFilterOptions = {
  partnerOptions: string[]
  restrictionOptions: string[]
  grantOptions: string[]
  stateOptions: string[]
}

export const EMPTY_POOL_FILTER_OPTIONS: PoolByStateFilterOptions = {
  partnerOptions: [],
  restrictionOptions: [],
  grantOptions: [],
  stateOptions: [],
}

export function uniqueSortedStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(values.map((v) => (v ?? '').trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b))
}

function splitParam(searchParams: URLSearchParams, key: string): string[] {
  return (searchParams.get(key) ?? '')
    .split('|')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function parsePoolSliceFilters(searchParams: URLSearchParams): PoolSliceFilters {
  return {
    decisionId: (searchParams.get('decision_id') ?? '').trim(),
    dateFrom: (searchParams.get('date_from') ?? '').trim(),
    dateTo: (searchParams.get('date_to') ?? '').trim(),
    partners: splitParam(searchParams, 'partner'),
    restrictions: splitParam(searchParams, 'restriction'),
    grants: splitParam(searchParams, 'grant'),
    states: splitParam(searchParams, 'state'),
  }
}

export function poolSliceFromActiveFilters(filters: ActiveFilter[]): PoolSliceFilters {
  const out: PoolSliceFilters = {
    decisionId: '',
    dateFrom: '',
    dateTo: '',
    partners: [],
    restrictions: [],
    grants: [],
    states: [],
  }
  for (const f of filters) {
    if (f.fieldId === 'decision_id') {
      out.decisionId = String(f.value ?? '').trim()
    } else if (f.fieldId === 'date_range' && Array.isArray(f.value)) {
      out.dateFrom = String(f.value[0] ?? '').trim()
      out.dateTo = String(f.value[1] ?? '').trim()
    } else if (f.fieldId === 'partner' && Array.isArray(f.value)) {
      out.partners = f.value.map((v) => String(v).trim()).filter(Boolean)
    } else if (f.fieldId === 'restriction' && Array.isArray(f.value)) {
      out.restrictions = f.value.map((v) => String(v).trim()).filter(Boolean)
    } else if (f.fieldId === 'grant' && Array.isArray(f.value)) {
      out.grants = f.value.map((v) => String(v).trim()).filter(Boolean)
    } else if (f.fieldId === 'state' && Array.isArray(f.value)) {
      out.states = f.value.map((v) => String(v).trim()).filter(Boolean)
    }
  }
  return out
}

export function poolSliceToQueryString(slice: PoolSliceFilters): string {
  const p = new URLSearchParams()
  if (slice.decisionId) p.set('decision_id', slice.decisionId)
  if (slice.dateFrom) p.set('date_from', slice.dateFrom)
  if (slice.dateTo) p.set('date_to', slice.dateTo)
  if (slice.partners.length) p.set('partner', slice.partners.join('|'))
  if (slice.restrictions.length) p.set('restriction', slice.restrictions.join('|'))
  if (slice.grants.length) p.set('grant', slice.grants.join('|'))
  if (slice.states.length) p.set('state', slice.states.join('|'))
  const q = p.toString()
  return q ? `?${q}` : ''
}

export function dateKey(value: unknown): string | null {
  if (value == null) return null
  const m = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

export function inDateRange(value: unknown, from: string, to: string): boolean {
  if (!from && !to) return true
  const d = dateKey(value)
  if (!d) return false
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export function matchesMulti(
  value: unknown,
  selected: string[],
  normalize?: (s: string) => string
): boolean {
  if (selected.length === 0) return true
  const trimmed = String(value ?? '').trim()
  const hasUnassigned = selected.some((t) => t.trim() === '__unassigned__')
  const wanted = new Set(
    selected
      .map((t) => t.trim())
      .filter((t) => t && t !== '__unassigned__')
      .map((t) => (normalize ? normalize(t) : t).toLowerCase())
  )
  if (!trimmed) return hasUnassigned
  const normalized = (normalize ? normalize(trimmed) : trimmed).toLowerCase()
  return wanted.has(normalized)
}

export function matchesDecisionId(value: unknown, term: string): boolean {
  if (!term) return true
  return String(value ?? '').toLowerCase().includes(term.toLowerCase())
}

export function poolByStateRows<T = Record<string, unknown>>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[]
  if (payload && typeof payload === 'object' && Array.isArray((payload as { rows?: unknown }).rows)) {
    return (payload as { rows: T[] }).rows
  }
  return []
}

export function poolByStateFilterOptions(payload: unknown): PoolByStateFilterOptions | null {
  if (!payload || typeof payload !== 'object') return null
  const opts = (payload as { filter_options?: PoolByStateFilterOptions }).filter_options
  if (!opts || typeof opts !== 'object') return null
  return {
    partnerOptions: Array.isArray(opts.partnerOptions) ? opts.partnerOptions : [],
    restrictionOptions: Array.isArray(opts.restrictionOptions) ? opts.restrictionOptions : [],
    grantOptions: Array.isArray(opts.grantOptions) ? opts.grantOptions : [],
    stateOptions: Array.isArray(opts.stateOptions) ? opts.stateOptions : [],
  }
}
