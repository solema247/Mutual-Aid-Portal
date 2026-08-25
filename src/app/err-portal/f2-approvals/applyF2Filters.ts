import { applyFilters, type ActiveFilter, type FilterFieldConfig } from '@/components/smart-filter'

type F2FilterRow = {
  date?: string | null
  state?: string | null
  err_id?: string | null
  locality?: string | null
  grant_call_name?: string | null
  donor_name?: string | null
  err_name?: string | null
  err_code?: string | null
}

export function f2GrantFilterValue(row: {
  grant_call_name?: string | null
  donor_name?: string | null
}): string {
  if (!row.grant_call_name || !row.donor_name) return '__unassigned__'
  return `${row.grant_call_name}|${row.donor_name}`
}

export function getF2FieldValue(row: F2FilterRow, fieldId: string): string | null | undefined {
  if (fieldId === 'date_range') return row.date ?? null
  if (fieldId === 'state') return row.state ?? null
  if (fieldId === 'grant') return f2GrantFilterValue(row)
  if (fieldId === 'donor') return row.donor_name ?? null
  if (fieldId === 'search') return row.err_id ?? null
  return null
}

export function applyF2SmartFilters<T extends F2FilterRow>(opts: {
  data: T[]
  filters: ActiveFilter[]
  fields: FilterFieldConfig[]
}): T[] {
  const { data, filters, fields } = opts
  const filtersForApply = filters.filter((f) => f.fieldId !== 'search' && f.fieldId !== 'date_range')
  let result = applyFilters({
    data,
    filters: filtersForApply,
    fields,
    getFieldValue: getF2FieldValue,
  })

  const dateFilter = filters.find((f) => f.fieldId === 'date_range')
  if (dateFilter && Array.isArray(dateFilter.value)) {
    const from = String(dateFilter.value[0] ?? '').slice(0, 10)
    const to = String(dateFilter.value[1] ?? '').slice(0, 10)
    if (from || to) {
      result = result.filter((r) => {
        const rowDay = String(r.date ?? '').slice(0, 10)
        if (!rowDay) return false
        if (from && rowDay < from) return false
        if (to && rowDay > to) return false
        return true
      })
    }
  }

  const searchFilter = filters.find((f) => f.fieldId === 'search')
  const term = searchFilter ? String(searchFilter.value ?? '').trim().toLowerCase() : ''
  if (term) {
    result = result.filter((r) =>
      [r.err_id, r.state, r.locality, r.grant_call_name, r.donor_name, r.err_name, r.err_code].some(
        (v) => v && String(v).toLowerCase().includes(term)
      )
    )
  }
  return result
}
