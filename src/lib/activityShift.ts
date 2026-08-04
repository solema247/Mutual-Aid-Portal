import type { SupabaseClient } from '@supabase/supabase-js'
import { getSectorWithHighestAmount } from '@/lib/plannedActivitiesExpenses'

function parseJsonArray(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw || '[]')
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

/** Unique non-empty category labels from F1 planned_activities. */
export function getPlannedSectorSet(plannedActivities: unknown): Set<string> {
  const set = new Set<string>()
  for (const item of parseJsonArray(plannedActivities)) {
    const c = item?.category ?? item?.Category
    if (c != null && String(c).trim() !== '') set.add(String(c).trim())
  }
  return set
}

export function isActivityShifted(
  plannedActivities: unknown,
  expenses: unknown,
  implementedSector: string | null | undefined
): boolean {
  const impl = implementedSector != null ? String(implementedSector).trim() : ''
  if (!impl) return false
  const planned = getPlannedSectorSet(plannedActivities)
  if (planned.size === 0) {
    const primary = getSectorWithHighestAmount(plannedActivities, expenses)
    if (!primary) return false
    return primary.trim().toLowerCase() !== impl.toLowerCase()
  }
  return !Array.from(planned).some((p) => p.toLowerCase() === impl.toLowerCase())
}

/**
 * Pick primary implemented sector from F5 reach rows:
 * category with highest individual_count, else first non-null category.
 */
export function pickImplementedSectorFromReach(
  reach: Array<{ category?: string | null; individual_count?: number | null }>
): string | null {
  const byCat = new Map<string, number>()
  for (const r of reach || []) {
    const c = r.category != null ? String(r.category).trim() : ''
    if (!c) continue
    const n = Number(r.individual_count) || 0
    byCat.set(c, (byCat.get(c) || 0) + n)
  }
  if (byCat.size === 0) return null
  let best: string | null = null
  let bestSum = -Infinity
  for (const [name, sum] of byCat) {
    if (sum > bestSum) {
      bestSum = sum
      best = name
    }
  }
  return best
}

/**
 * After F5 save/update: set err_projects.implemented_sector from reach categories
 * when the project has no implemented_sector yet, or always refresh from this report's reach
 * when reach has categories (keeps F5 as source of truth for sector when user tags activities).
 * Does not touch planned_activities / expenses.
 */
export async function syncImplementedSectorFromF5(
  supabase: SupabaseClient,
  projectId: string | null | undefined,
  reach: Array<{ category?: string | null; individual_count?: number | null }>,
  userId?: string | null
): Promise<{ ok: true; implemented_sector: string | null } | { ok: false; error: string }> {
  if (!projectId) return { ok: false, error: 'project_id required' }

  const fromReach = pickImplementedSectorFromReach(reach)
  if (!fromReach) {
    return { ok: true, implemented_sector: null }
  }

  const patch: Record<string, unknown> = {
    implemented_sector: fromReach,
    activity_shift_updated_at: new Date().toISOString(),
  }
  if (userId) patch.activity_shift_updated_by = userId

  const { error } = await supabase
    .from('err_projects')
    .update(patch)
    .eq('id', projectId)

  if (error) return { ok: false, error: error.message }
  return { ok: true, implemented_sector: fromReach }
}
