import type { SupabaseClient } from '@supabase/supabase-js'

// Visual compliance (OFAC) screening helpers.
// Name extraction/normalization ported from scripts/screen-sanctions-strict.py
// so portal-side matching stays consistent with the offline sanctions screen.

const STOP_WORDS = new Set([
  'bin', 'ibn', 'mr', 'mrs', 'dr', 'the', 'of', 'for',
  'name', 'account', 'number', 'bank', 'signature'
])

export type ScreeningStatus =
  | 'pending_screening'
  | 'cleared'
  | 'flagged'
  | 'auto_approved'
  | 'committed_without_clearance'
export type FinanceReviewStatus = 'pending' | 'approved' | 'rejected'
export type FlagType = 'missing_id' | 'sanctions_match'

/** Portal screening queue starts on this instant (UTC). Earlier F1s are out of Screening. */
export const COMPLIANCE_QUEUE_START_ISO = '2026-07-01T00:00:00.000Z'

const PRE_JULY_AUDIT_NOTE =
  'Operational cutoff: F1 raised before 2026-07-01. Tagged committed without clearance; not shown in Screening. Not a Clear.'

/**
 * Earliest of the F1 date and the portal submission time. An F1 counts as
 * pre-July if either one is before the cutoff.
 */
export function complianceRaisedAt(p: {
  submitted_at?: string | null
  date?: string | null
  created_at?: string | null
}): string | null {
  const candidates = [
    p.submitted_at || null,
    p.date ? (p.date.includes('T') ? p.date : `${p.date}T00:00:00.000Z`) : null,
  ].filter((v): v is string => Boolean(v) && !Number.isNaN(Date.parse(v as string)))
  if (candidates.length === 0) return p.created_at || null
  return candidates.reduce((a, b) => (Date.parse(a) <= Date.parse(b) ? a : b))
}

/** True when the F1 falls before the portal screening cutoff (1 Jul 2026). */
export function isPreJulyProject(p: {
  submitted_at?: string | null
  date?: string | null
}): boolean {
  return isBeforeComplianceQueueStart(complianceRaisedAt(p))
}

/** True when the F1 was raised before portal screening started (1 Jul 2026). */
export function isBeforeComplianceQueueStart(raisedAt: string | null | undefined): boolean {
  if (!raisedAt) return false
  const t = Date.parse(raisedAt)
  if (Number.isNaN(t)) return false
  return t < Date.parse(COMPLIANCE_QUEUE_START_ISO)
}

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
 * NOTE: not yet used for live screening — F1 banking details usually carry one language.
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
 * whitelist are auto-approved; everything else lands in the pending queue —
 * including F1s with blank banking details or zero extracted names
 * ("Name not extracted") and F1s with multiple payee names (one row listing all).
 *
 * Idempotent: projects that already have a screening are skipped
 * (compliance_screenings.project_id is unique).
 */
export async function ensureScreeningsForProjects(
  supabase: SupabaseClient,
  projects: Array<{
    id: string
    banking_details: string | null
    submitted_at?: string | null
    date?: string | null
  }>
): Promise<{ created: number }> {
  if (projects.length === 0) return { created: 0 }

  const ids = projects.map(p => p.id)
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

  const missing = projects.filter(p => !existing.has(p.id))
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
    const preJuly = isBeforeComplianceQueueStart(
      complianceRaisedAt({ submitted_at: project.submitted_at, date: project.date })
    )
    if (preJuly) {
      return {
        id: crypto.randomUUID(),
        project_id: project.id,
        names,
        status: 'committed_without_clearance' as ScreeningStatus,
        flag_note: PRE_JULY_AUDIT_NOTE,
        screened_by: 'system:pre-july-cutoff',
        screened_at: new Date().toISOString()
      }
    }
    // Empty names never auto-approve — they must go through Ahmad (Name not extracted).
    const autoApproved = names.length > 0 && keys.every(k => approvedKeys.has(k))
    return {
      id: crypto.randomUUID(),
      project_id: project.id,
      names,
      status: (autoApproved ? 'auto_approved' : 'pending_screening') as ScreeningStatus
    }
  })

  const { error: insertError } = await supabase
    .from('compliance_screenings')
    .upsert(rows, { onConflict: 'project_id', ignoreDuplicates: true })
  if (insertError && /check|committed_without_clearance/i.test(insertError.message || '')) {
    const fallback = rows.map((r) =>
      r.status === 'committed_without_clearance'
        ? { ...r, status: 'pending_screening' as ScreeningStatus }
        : r
    )
    const retry = await supabase
      .from('compliance_screenings')
      .upsert(fallback, { onConflict: 'project_id', ignoreDuplicates: true })
    if (retry.error) throw retry.error
  } else if (insertError) {
    throw insertError
  }

  return { created: rows.length }
}

/**
 * Sweep err_projects that still need a compliance screening and create rows.
 * Includes committed F1s (retrospective review) and projects with blank
 * banking details (Name not extracted). Declined/completed stay excluded.
 */
export async function sweepUnscreenedProjects(
  supabase: SupabaseClient
): Promise<{ created: number }> {
  const { data: screened, error: screenedError } = await supabase
    .from('compliance_screenings')
    .select('project_id')
  if (screenedError) throw screenedError
  const screenedIds = new Set((screened || []).map(r => r.project_id))

  const unscreened: Array<{
    id: string
    banking_details: string | null
    submitted_at?: string | null
    date?: string | null
  }> = []
  const pageSize = 1000
  for (let start = 0; ; start += pageSize) {
    const { data, error } = await supabase
      .from('err_projects')
      .select('id, banking_details, funding_status, status, file_key, temp_file_key, submitted_at, date')
      .range(start, start + pageSize - 1)
    if (error) throw error
    const page = data || []
    for (const row of page) {
      if (row.status === 'declined' || row.status === 'completed') continue
      // Prefer F1s that have a document (or banking text) so the queue is actionable
      const hasDoc = Boolean(row.file_key || row.temp_file_key)
      const hasBanking = Boolean((row.banking_details || '').trim())
      if (!hasDoc && !hasBanking) continue
      if (!screenedIds.has(row.id)) {
        unscreened.push({
          id: row.id,
          banking_details: row.banking_details,
          submitted_at: row.submitted_at,
          date: row.date
        })
      }
    }
    if (page.length < pageSize) break
  }

  return ensureScreeningsForProjects(supabase, unscreened)
}

/**
 * Move every open screening (Screening queue and Finance Review) for F1s
 * before 2026-07-01 to committed_without_clearance. Does not set cleared.
 */
export async function retagPreJulyScreenings(
  supabase: SupabaseClient
): Promise<{ tagged: number }> {
  const { data, error } = await supabase
    .from('compliance_screenings')
    .select(
      'id, status, err_projects!inner(submitted_at, date)'
    )
    .in('status', ['pending_screening', 'flagged'])
  if (error) throw error

  const ids: string[] = []
  for (const row of data || []) {
    const raw = (row as { err_projects?: unknown }).err_projects
    const p = (Array.isArray(raw) ? raw[0] : raw) as {
      submitted_at?: string | null
      date?: string | null
    } | null
    if (
      isBeforeComplianceQueueStart(
        complianceRaisedAt({ submitted_at: p?.submitted_at, date: p?.date })
      )
    ) {
      ids.push(row.id)
    }
  }
  if (ids.length === 0) return { tagged: 0 }

  const now = new Date().toISOString()
  let tagged = 0
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { error: updError } = await supabase
      .from('compliance_screenings')
      .update({
        status: 'committed_without_clearance',
        flag_note: PRE_JULY_AUDIT_NOTE,
        screened_by: 'system:pre-july-cutoff',
        screened_at: now,
        finance_review_status: null
      })
      .in('id', chunk)
    if (updError) {
      if (/check|committed_without_clearance/i.test(updError.message || '')) {
        const retry = await supabase
          .from('compliance_screenings')
          .update({
            flag_note: PRE_JULY_AUDIT_NOTE,
            screened_by: 'system:pre-july-cutoff',
            screened_at: now
          })
          .in('id', chunk)
        if (retry.error) throw retry.error
        tagged += chunk.length
        continue
      }
      throw updError
    }
    tagged += chunk.length
  }
  return { tagged }
}

/** True when a screening row still stops payment from being recorded. Never for pre-July F1s. */
export function isPaymentBlockedByCompliance(
  s: { status: string; finance_review_status?: string | null },
  project?: { submitted_at?: string | null; date?: string | null } | null
): boolean {
  if (project && isPreJulyProject(project)) return false
  if (s.status === 'pending_screening') return true
  if (s.status === 'flagged') return s.finance_review_status !== 'rejected'
  return false
}

/**
 * Return the subset of project ids whose payment cannot be recorded yet.
 * Committing is never blocked by compliance; only payment confirmation is.
 *
 * - pending_screening: blocked until Ahmad clears
 * - flagged (missing_id / sanctions_match / legacy): blocked until cleared,
 *   or until finance dismisses the flag as erroneous (rejected)
 * - cleared / auto_approved / committed_without_clearance / no screening: allowed
 */
export async function getPaymentBlockedProjectIds(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<string[]> {
  if (projectIds.length === 0) return []
  const blocked: string[] = []
  for (let i = 0; i < projectIds.length; i += 200) {
    const chunk = projectIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('compliance_screenings')
      .select('project_id, status, finance_review_status, err_projects!inner(submitted_at, date)')
      .in('project_id', chunk)
      .in('status', ['pending_screening', 'flagged'])
    if (error) throw error
    for (const row of data || []) {
      const raw = (row as { err_projects?: unknown }).err_projects
      const project = (Array.isArray(raw) ? raw[0] : raw) as {
        submitted_at?: string | null
        date?: string | null
      } | null
      if (isPaymentBlockedByCompliance(row, project)) blocked.push(row.project_id)
    }
  }
  return blocked
}

/** True when payment is already committed and compliance is still open. */
export function isPaymentAlreadyCommitted(s: {
  status: string
  funding_status?: string | null
}): boolean {
  if (s.funding_status !== 'committed') return false
  if (s.status === 'committed_without_clearance') return false
  return s.status === 'pending_screening' || s.status === 'flagged'
}
