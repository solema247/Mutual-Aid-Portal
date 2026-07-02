export function toDisplay(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    if (Array.isArray(value)) {
      return value
        .map((item: unknown) => {
          if (item == null) return ''
          if (typeof item === 'string') return item
          if (typeof item === 'object' && item !== null) {
            const obj = item as Record<string, unknown>
            return (
              obj.activity ||
              obj.description ||
              obj.selectedActivity ||
              JSON.stringify(item)
            )
          }
          return String(item)
        })
        .join('\n')
    }
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

export function getCategoriesFromPlannedActivities(plannedActivities: unknown): string {
  try {
    const arr =
      typeof plannedActivities === 'string'
        ? JSON.parse(plannedActivities || '[]')
        : Array.isArray(plannedActivities)
          ? plannedActivities
          : []
    const categories = Array.from(
      new Set(arr.map((a: { category?: string }) => a?.category).filter(Boolean))
    ) as string[]
    return categories.length ? categories.join(', ') : '—'
  } catch {
    return '—'
  }
}

export function sumExpensesUsd(expenses: unknown): number {
  try {
    const arr =
      typeof expenses === 'string'
        ? JSON.parse(expenses || '[]')
        : Array.isArray(expenses)
          ? expenses
          : []
    return arr.reduce((s: number, e: { total_cost?: number }) => s + (e?.total_cost || 0), 0)
  } catch {
    return 0
  }
}

export function fmtUsd(n: number) {
  return (n ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
