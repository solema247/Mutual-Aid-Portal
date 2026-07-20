import type { SupabaseClient } from '@supabase/supabase-js'

// Visual compliance (OFAC) screening helpers.
// Name extraction/normalization ported from scripts/screen-sanctions-strict.py
// so portal-side matching stays consistent with the offline sanctions screen.

const STOP_WORDS = new Set([
  'bin', 'ibn', 'mr', 'mrs', 'dr', 'the', 'of', 'for',
  'name', 'account', 'number', 'bank', 'signature'
])

export type ScreeningStatus = 'pending_screening' | 'cleared' | 'flagged' | 'auto_approved'
export type FinanceReviewStatus = 'pending' | 'approved' | 'rejected'
export type FlagType = 'missing_id' | 'sanctions_match'

/** Tokenize a payee name: lowercase, keep latin + arabic letters, drop stopwords/digits. */
export function nameTokens(name: string): string[] {
  const cleaned = (name || '').toLowerCase().replace(/[^a-z\u0600-\u06ff\s]/g, ' ')
  return cleaned
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w) && !/^\d+$/.test(w))
}

/**
 * Stable normalized key for a name (token multiset), e.g. "ali:2|mohammed:1".
 * Used as the unique key in approved_beneficiaries.
 */
export function normalizedNameKey(name: string): string {
  const counts = new Map<string, number>()
  for (const tok of nameTokens(name)) {
    counts.set(tok, (counts.get(tok) || 0) + 1)
  }
  return Array.from(counts.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([tok, n]) => `${tok}:${n}`)
    .join('|')
}

/**
 * Combined EN+AR "alpha" key: the English key and the Arabic key joined into a
 * single identity for one beneficiary (e.g. "ahmed:1|ali:1::احمد:1|علي:1").
 *
 * This is the most precise, discrepancy-proof match because it requires BOTH the
 * English and Arabic name to line up — it also disambiguates Arabic names that
 * share the same token multiset in a different order.
 *
 * NOTE: it is intentionally NOT yet used for live screening. Incoming F1 banking
 * details currently carry only ONE language (~97% English), so a combined key
 * cannot be built at screening time and would flag every payee for manual review.
 * We keep it here, ready to switch on once the F1 intake captures a structured
 * English AND Arabic beneficiary name (with a single-language fallback). Until
 * then screening stays per-language (see ensureScreeningsForProjects).
 */
export function combinedNameKey(nameEn: string, nameAr: string): string | null {
  const keyEn = normalizedNameKey(nameEn)
  const keyAr = normalizedNameKey(nameAr)
  if (!keyEn || !keyAr) return null
  return `${keyEn}::${keyAr}`
}

/** Extract candidate payee names from a free-text banking details blob. */
export function extractNamesFromBanking(text: string | null | undefined): string[] {
  if (!text) return []
  const names = new Set<string>()

  // Explicit "Name: ..." lines (latin form; arabic bank text keeps the latin label in our data)
  const nameLineRe = /(?:^|\n)\s*Name\s*:\s*([^\n]+)/gi
  let m: RegExpExecArray | null
  while ((m = nameLineRe.exec(text)) !== null) {
    const candidate = m[1].trim()
    if (candidate.length > 2) names.add(candidate)
  }

  // First few non-banking lines that look like a person's name
  const bankKeywordRe = /bank|account|number|iban|signature|date\s*:|بنك/i
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean).slice(0, 4)
  for (const line of lines) {
    if (bankKeywordRe.test(line) || /^\d+$/.test(line.replace(/\s/g, ''))) continue
    if (line.length >= 6 && line.length < 100 && line.split(/\s+/).length >= 2) {
      names.add(line.replace(/^(the works of)\s+/i, ''))
    }
  }

  // Keep names with at least two meaningful tokens; dedupe variants of the
  // same name (e.g. "Name: X" vs "X"), preferring the one without a label
  const byKey = new Map<string, string>()
  for (const candidate of names) {
    if (nameTokens(candidate).length < 2) continue
    const key = normalizedNameKey(candidate)
    const cleaned = candidate.replace(/^\s*Name\s*:\s*/i, '').trim()
    const existing = byKey.get(key)
    if (!existing || cleaned.length < existing.length) {
      byKey.set(key, cleaned)
    }
  }
  return Array.from(byKey.values())
}

/**
 * Ensure a compliance screening row exists for each given project.
 * Projects whose extracted names are all on the approved_beneficiaries
 * whitelist are auto-approved; everything else lands in the pending queue.
 *
 * Idempotent: projects that already have a screening are skipped
 * (compliance_screenings.project_id is unique).
 */
export async function ensureScreeningsForProjects(
  supabase: SupabaseClient,
  projects: Array<{ id: string; banking_details: string | null }>
): Promise<{ created: number }> {
  const candidates = projects.filter(p => (p.banking_details || '').trim().length > 0)
  if (candidates.length === 0) return { created: 0 }

  const ids = candidates.map(p => p.id)
  const existing = new Set<string>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data, error } = await supabase
      .from('compliance_screenings')
      .select('project_id')
      .in('project_id', chunk)
    if (error) throw error
    for (const row of data || []) existing.add(row.project_id)
  }

  const missing = candidates.filter(p => !existing.has(p.id))
  if (missing.length === 0) return { created: 0 }

  // Collect normalized keys across all missing projects for one whitelist lookup
  const extracted = missing.map(p => {
    const names = extractNamesFromBanking(p.banking_details)
    return { project: p, names, keys: names.map(normalizedNameKey) }
  })
  const allKeys = Array.from(new Set(extracted.flatMap(e => e.keys))).filter(Boolean)

  const approvedKeys = new Set<string>()
  for (let i = 0; i < allKeys.length; i += 200) {
    const chunk = allKeys.slice(i, i + 200)
    const { data, error } = await supabase
      .from('approved_beneficiaries')
      .select('normalized_key')
      .in('normalized_key', chunk)
    if (error) throw error
    for (const row of data || []) approvedKeys.add(row.normalized_key)
  }

  const rows = extracted.map(({ project, names, keys }) => {
    const autoApproved = names.length > 0 && keys.every(k => approvedKeys.has(k))
    return {
      project_id: project.id,
      names,
      status: (autoApproved ? 'auto_approved' : 'pending_screening') as ScreeningStatus
    }
  })

  const { error: insertError } = await supabase
    .from('compliance_screenings')
    .upsert(rows, { onConflict: 'project_id', ignoreDuplicates: true })
  if (insertError) throw insertError

  return { created: rows.length }
}

/**
 * Sweep err_projects that have banking details but no screening yet and
 * create screenings for them. Covers F1s created outside portal API routes
 * (ERR App submissions, legacy client-side inserts) and acts as the backfill.
 */
export async function sweepUnscreenedProjects(
  supabase: SupabaseClient
): Promise<{ created: number }> {
  const { data: screened, error: screenedError } = await supabase
    .from('compliance_screenings')
    .select('project_id')
  if (screenedError) throw screenedError
  const screenedIds = new Set((screened || []).map(r => r.project_id))

  const unscreened: Array<{ id: string; banking_details: string | null }> = []
  const pageSize = 1000
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('id, banking_details, funding_status, status')
      .not('banking_details', 'is', null)
      .range(start, start + pageSize - 1)
    if (error) throw error
    const page = data || []
    for (const row of page) {
      // Committed F1s already passed the gate; declined/completed ones
      // will never commit — don't queue either retroactively
      if (row.funding_status === 'committed') continue
      if (row.status === 'declined' || row.status === 'completed') continue
      if (!screenedIds.has(row.id)) {
        unscreened.push({ id: row.id, banking_details: row.banking_details })
      }
    }
    if (page.length < pageSize) break
  }

  return ensureScreeningsForProjects(supabase, unscreened)
}

/**
 * Return the subset of project ids that are blocked from committing.
 *
 * - sanctions_match: blocked until finance dismisses the flag as erroneous
 * - missing_id: blocked until finance uploads an ID (approved) or dismisses the flag
 * - legacy flagged rows with no flag_type: blocked until finance approves or dismisses
 */
export async function getComplianceBlockedProjectIds(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return []
  const blocked: string[] = []
  for (let i = 0; i < projectIds.length; i += 200) {
    const chunk = projectIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('compliance_screenings')
      .select('project_id, status, flag_type, finance_review_status')
      .in('project_id', chunk)
      .eq('status', 'flagged')
    if (error) throw error
    for (const row of data || []) {
      const review = row.finance_review_status
      // Dismissed as erroneous → not blocked
      if (review === 'rejected') continue
      if (row.flag_type === 'sanctions_match') {
        // Payment must be stopped until the flag is dismissed
        blocked.push(row.project_id)
        continue
      }
      if (row.flag_type === 'missing_id') {
        // Unblocked only after ID upload (approved)
        if (review !== 'approved') blocked.push(row.project_id)
        continue
      }
      // Legacy generic flag
      if (review !== 'approved') blocked.push(row.project_id)
    }
  }
  return blocked
}
