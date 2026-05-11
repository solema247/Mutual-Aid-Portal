/**
 * Normalize Mutual Aid expense/planned category labels so spend aggregates
 * match known sectors (case, spacing, common typos) and "Other" sublabels
 * don't repeat sectors that already have their own line.
 */

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

/** Canonical sector labels (aligned with stories UI / planned activities). */
const KNOWN_SECTOR_LABELS = [
  'Shelter centers',
  'Volunteer support',
  'Community kitchen',
  'Flexible',
  'Education',
  'Livelihoods',
  'Socioeconomic Empowerment',
  'Alternative education',
  'Agriculture Support',
  'The needs of women and children',
  'Health support',
  'Youth Space',
  'Evacuation',
  'Food baskets',
  'WASH',
  'Capacity building',
  'Mental and physical health',
  'Support logistic operations',
  'Communications',
  'Other',
] as const

/** norm(raw) -> canonical display label for common mismatches vs planned/expense JSON. */
const NORM_ALIAS_TO_CANONICAL: Record<string, string> = {
  'volunteers support': 'Volunteer support',
  'volunteer supports': 'Volunteer support',
  'communication': 'Communications',
  'communications': 'Communications',
}

const knownNormToCanonical = new Map<string, string>()
for (const label of KNOWN_SECTOR_LABELS) {
  const n = normKey(label)
  if (!knownNormToCanonical.has(n)) knownNormToCanonical.set(n, label)
}
for (const [aliasNorm, canonical] of Object.entries(NORM_ALIAS_TO_CANONICAL)) {
  if (!knownNormToCanonical.has(aliasNorm)) knownNormToCanonical.set(aliasNorm, canonical)
}

export { normKey }

/** Map any raw label to a known canonical sector when possible. */
export function matchKnownSectorLabel(raw: string | null | undefined): string | null {
  if (raw == null) return null
  const t = String(raw).trim()
  if (!t) return null
  const n = normKey(t)
  if (NORM_ALIAS_TO_CANONICAL[n]) return NORM_ALIAS_TO_CANONICAL[n]
  const hit = knownNormToCanonical.get(n)
  return hit ?? null
}

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

/** activity (exact) -> category; plus norm(activity) -> category for lookup. */
export function getActivityToCategoryMaps(plannedActivities: unknown): {
  byExactActivity: Map<string, string>
  byNormActivity: Map<string, string>
} {
  const planned = parseJsonArray(plannedActivities)
  const byExactActivity = new Map<string, string>()
  const byNormActivity = new Map<string, string>()
  for (const item of planned) {
    const activity = item?.activity ?? item?.Activity
    const category = item?.category ?? item?.Category
    if (activity == null || !String(activity).trim() || category == null || !String(category).trim()) continue
    const act = String(activity).trim()
    const cat = String(category).trim()
    byExactActivity.set(act, cat)
    const nk = normKey(act)
    if (!byNormActivity.has(nk)) byNormActivity.set(nk, cat)
  }
  return { byExactActivity, byNormActivity }
}

/** norm(planned category string) -> first-seen display form from planned rows. */
function plannedCategoryCanonByNorm(plannedActivities: unknown): Map<string, string> {
  const planned = parseJsonArray(plannedActivities)
  const map = new Map<string, string>()
  for (const item of planned) {
    const category = item?.category ?? item?.Category
    if (category == null || !String(category).trim()) continue
    const cat = String(category).trim()
    const nk = normKey(cat)
    if (!map.has(nk)) map.set(nk, cat)
  }
  return map
}

function resolveCategoryForExpense(
  e: any,
  byExactActivity: Map<string, string>,
  byNormActivity: Map<string, string>,
  plannedCanonByNorm: Map<string, string>
): string {
  const explicit = (e?.category ?? e?.Category)?.trim?.()
  if (explicit) {
    const alias = matchKnownSectorLabel(explicit)
    if (alias) return alias
    const fromPlanned = plannedCanonByNorm.get(normKey(explicit))
    if (fromPlanned) return fromPlanned
    return explicit
  }

  const actRaw = String(e?.planned_activity ?? e?.activity ?? '').trim()
  if (actRaw) {
    const fromMap =
      byExactActivity.get(actRaw) ??
      byNormActivity.get(normKey(actRaw)) ??
      null
    if (fromMap) {
      const alias = matchKnownSectorLabel(fromMap)
      return alias ?? fromMap
    }
    const fromKnownActivity = matchKnownSectorLabel(actRaw)
    if (fromKnownActivity) return fromKnownActivity
    const actAsCat = plannedCanonByNorm.get(normKey(actRaw))
    if (actAsCat) return actAsCat
  }

  return 'Other'
}

/** Sum expenses by category; merges synonyms into known sector labels. */
export function getCategorySpend(expenses: unknown, plannedActivities: unknown): Map<string, number> {
  const exp = parseJsonArray(expenses)
  const { byExactActivity, byNormActivity } = getActivityToCategoryMaps(plannedActivities)
  const plannedCanonByNorm = plannedCategoryCanonByNorm(plannedActivities)
  const byCategory = new Map<string, number>()
  for (const e of exp) {
    const cost = Number(e?.total_cost) || 0
    if (cost <= 0) continue
    let key = resolveCategoryForExpense(e, byExactActivity, byNormActivity, plannedCanonByNorm)
    key = key.trim() || 'Other'
    byCategory.set(key, (byCategory.get(key) ?? 0) + cost)
  }
  return byCategory
}

/** Labels for expenses still in Other (for sub-bullets); omits text that matches a known sector. */
export function getOtherLabels(expenses: unknown, plannedActivities: unknown): string[] {
  const exp = parseJsonArray(expenses)
  const { byExactActivity, byNormActivity } = getActivityToCategoryMaps(plannedActivities)
  const plannedCanonByNorm = plannedCategoryCanonByNorm(plannedActivities)
  const labels: string[] = []
  const seenNorm = new Set<string>()
  for (const e of exp) {
    const cost = Number(e?.total_cost) || 0
    if (cost <= 0) continue
    const key = resolveCategoryForExpense(e, byExactActivity, byNormActivity, plannedCanonByNorm)
    if (key !== 'Other') continue
    const activity = String(e?.planned_activity ?? e?.activity ?? '').trim()
    const otherText = String(e?.planned_activity_other ?? '').trim()
    const isOtherActivity =
      !activity || activity.toLowerCase().includes('other') || activity.includes('أخرى')
    const label = isOtherActivity && otherText ? otherText : activity || 'Other'
    if (!label || label === 'Other') continue
    if (matchKnownSectorLabel(label)) continue
    const nk = normKey(label)
    if (seenNorm.has(nk)) continue
    seenNorm.add(nk)
    labels.push(label)
  }
  return labels
}
