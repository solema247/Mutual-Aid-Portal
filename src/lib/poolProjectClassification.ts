export type PoolProjectBucket = 'assigned' | 'committed' | 'pending'

export type PoolProjectRow = {
  expenses?: unknown
  funding_status?: string | null
  status?: string | null
  grant_id?: string | null
  grant_grid_id?: string | null
}

export function projectExpenseTotal(expenses: unknown): number {
  try {
    const exps = typeof expenses === 'string' ? JSON.parse(expenses as string) : expenses
    return (Array.isArray(exps) ? exps : []).reduce(
      (sum: number, e: { total_cost?: number }) => sum + (e?.total_cost || 0),
      0
    )
  } catch {
    return 0
  }
}

export function hasGrantAssignment(p: PoolProjectRow): boolean {
  const grantId = p.grant_id != null ? String(p.grant_id).trim() : ''
  const gridId = p.grant_grid_id != null ? String(p.grant_grid_id).trim() : ''
  return grantId.length > 0 || gridId.length > 0
}

/** Classify without changing stored funding_status. Assigned = already linked to a grant. */
export function classifyPoolProject(p: PoolProjectRow): PoolProjectBucket | null {
  if (hasGrantAssignment(p)) return 'assigned'
  const fundingStatus = (p.funding_status || '').toLowerCase()
  const status = (p.status || '').toLowerCase()
  if (fundingStatus === 'committed') return 'committed'
  if (fundingStatus === 'allocated' || (fundingStatus === 'unassigned' && status === 'pending')) {
    return 'pending'
  }
  return null
}

export function poolRowFromParts(parts: {
  allocated: number
  assigned: number
  committed: number
  pending: number
}) {
  const available = parts.allocated - parts.assigned
  const balance = available - parts.committed - parts.pending
  return {
    allocated: parts.allocated,
    assigned: parts.assigned,
    available,
    committed: parts.committed,
    pending: parts.pending,
    balance,
    remaining: balance,
  }
}
