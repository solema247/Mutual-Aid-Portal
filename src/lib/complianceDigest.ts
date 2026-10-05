import type { SupabaseClient } from '@supabase/supabase-js'
import { isPaymentAlreadyCommitted, complianceRaisedAt, isBeforeComplianceQueueStart } from '@/lib/compliance'
import { postComplianceSlack } from '@/lib/complianceAlerts'

export type DigestRow = {
  screeningId: string
  projectId: string
  errId: string | null
  payeeNames: string[]
  fspName: string | null
  committedAt: string | null
  committedBy: string | null
  workflowStatus: string
  link: string
}

/** Slack truncates long messages; keep the digest under this. */
const SLACK_MESSAGE_CHARS = 3800
const ROWS_IN_MESSAGE = 20

function appBaseUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'https://mutual-aid-portal.vercel.app')
  ).replace(/\/$/, '')
}

function workflowLabel(row: {
  status: string
  flag_type?: string | null
  finance_review_status?: string | null
}): string {
  if (row.status === 'pending_screening') return 'Compliance Review (pending screening)'
  if (row.status === 'flagged' && row.flag_type === 'missing_id') {
    if (row.finance_review_status === 'id_uploaded') return 'Compliance Review (ID uploaded — awaiting Clear)'
    if (row.finance_review_status === 'pending') return 'Finance Review (missing ID)'
    return `Flagged missing ID (${row.finance_review_status || 'open'})`
  }
  if (row.status === 'flagged' && row.flag_type === 'sanctions_match') {
    return 'Flagged — sanctions match'
  }
  if (row.status === 'flagged') return 'Flagged (finance review)'
  return row.status
}

/**
 * F1s that were payment-committed (or have an FSP confirmation) before Ahmad
 * cleared them — still open in the compliance lifecycle.
 */
export async function loadCommittedBeforeClearedRows(
  supabase: SupabaseClient
): Promise<DigestRow[]> {
  const { data: screenings, error } = await supabase
    .from('compliance_screenings')
    .select(
      `
      id,
      project_id,
      names,
      status,
      flag_type,
      finance_review_status,
      err_projects!inner (
        id,
        err_id,
        funding_status,
        committed_at,
        committed_by,
        status,
        file_key,
        temp_file_key,
        submitted_at,
        date
      )
    `
    )
    .in('status', ['pending_screening', 'flagged'])

  if (error) {
    // committed_at/by may not exist yet — retry without those columns
    if (/committed_at|committed_by/i.test(error.message || '')) {
      return loadCommittedBeforeClearedRowsLegacy(supabase)
    }
    throw error
  }

  const projectIds = (screenings || []).map((s) => s.project_id as string)
  const fspByProject = await loadFspNamesByProject(supabase, projectIds)

  const base = appBaseUrl()
  const rows: DigestRow[] = []

  for (const s of screenings || []) {
    const raw = (s as { err_projects?: unknown }).err_projects
    const p = (Array.isArray(raw) ? raw[0] : raw) as {
      id?: string
      err_id?: string | null
      funding_status?: string | null
      committed_at?: string | null
      committed_by?: string | null
      status?: string | null
      file_key?: string | null
      temp_file_key?: string | null
      submitted_at?: string | null
      date?: string | null
    } | null
    if (!p) continue
    if (!(p.file_key || p.temp_file_key)) continue
    if (p.status === 'completed' || p.status === 'declined') continue
    if (
      isBeforeComplianceQueueStart(
        complianceRaisedAt({ submitted_at: p.submitted_at, date: p.date })
      )
    ) {
      continue
    }

    const hasFsp = Boolean(fspByProject.get(s.project_id))
    const committed = isPaymentAlreadyCommitted({
      status: s.status,
      funding_status: p.funding_status
    })
    if (!committed && !hasFsp) continue

    rows.push({
      screeningId: s.id,
      projectId: s.project_id,
      errId: p.err_id || null,
      payeeNames: Array.isArray(s.names) ? s.names : [],
      fspName: fspByProject.get(s.project_id) || null,
      committedAt: p.committed_at || null,
      committedBy: p.committed_by || null,
      workflowStatus: workflowLabel({
        status: s.status,
        flag_type: s.flag_type,
        finance_review_status: s.finance_review_status
      }),
      link: `${base}/err-portal/compliance?screening=${s.id}`
    })
  }

  rows.sort((a, b) => {
    const at = Date.parse(a.committedAt || '') || 0
    const bt = Date.parse(b.committedAt || '') || 0
    return bt - at
  })
  return rows
}

async function loadCommittedBeforeClearedRowsLegacy(
  supabase: SupabaseClient
): Promise<DigestRow[]> {
  const { data: screenings, error } = await supabase
    .from('compliance_screenings')
    .select(
      `
      id,
      project_id,
      names,
      status,
      flag_type,
      finance_review_status,
      err_projects!inner (
        id,
        err_id,
        funding_status,
        status,
        file_key,
        temp_file_key,
        submitted_at,
        date
      )
    `
    )
    .in('status', ['pending_screening', 'flagged'])
  if (error) throw error

  const projectIds = (screenings || []).map((s) => s.project_id as string)
  const fspByProject = await loadFspNamesByProject(supabase, projectIds)
  const base = appBaseUrl()
  const rows: DigestRow[] = []

  for (const s of screenings || []) {
    const raw = (s as { err_projects?: unknown }).err_projects
    const p = (Array.isArray(raw) ? raw[0] : raw) as {
      err_id?: string | null
      funding_status?: string | null
      status?: string | null
      file_key?: string | null
      temp_file_key?: string | null
      submitted_at?: string | null
      date?: string | null
    } | null
    if (!p) continue
    if (!(p.file_key || p.temp_file_key)) continue
    if (p.status === 'completed' || p.status === 'declined') continue
    if (
      isBeforeComplianceQueueStart(
        complianceRaisedAt({ submitted_at: p.submitted_at, date: p.date })
      )
    ) {
      continue
    }
    const hasFsp = Boolean(fspByProject.get(s.project_id))
    const committed = isPaymentAlreadyCommitted({
      status: s.status,
      funding_status: p.funding_status
    })
    if (!committed && !hasFsp) continue
    rows.push({
      screeningId: s.id,
      projectId: s.project_id,
      errId: p.err_id || null,
      payeeNames: Array.isArray(s.names) ? s.names : [],
      fspName: fspByProject.get(s.project_id) || null,
      committedAt: null,
      committedBy: null,
      workflowStatus: workflowLabel({
        status: s.status,
        flag_type: s.flag_type,
        finance_review_status: s.finance_review_status
      }),
      link: `${base}/err-portal/compliance?screening=${s.id}`
    })
  }
  return rows
}

async function loadFspNamesByProject(
  supabase: SupabaseClient,
  projectIds: string[]
): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  if (projectIds.length === 0) return out

  const fspIdByProject = new Map<string, string>()
  for (let i = 0; i < projectIds.length; i += 200) {
    const chunk = projectIds.slice(i, i + 200)
    const { data, error } = await supabase
      .from('mou_payment_confirmations')
      .select('project_id, fsp_id, transfer_date, created_at')
      .in('project_id', chunk)
      .order('transfer_date', { ascending: false })
    if (error) {
      console.warn('[compliance-digest] FSP lookup failed:', error.message)
      return out
    }
    // Prefer latest confirmation with an fsp_id
    const sorted = (data || []).slice().sort((a, b) => {
      const at = Date.parse(a.transfer_date || a.created_at || '') || 0
      const bt = Date.parse(b.transfer_date || b.created_at || '') || 0
      return bt - at
    })
    for (const row of sorted) {
      if (!row.project_id || !row.fsp_id) continue
      if (!fspIdByProject.has(row.project_id)) {
        fspIdByProject.set(row.project_id, String(row.fsp_id))
      }
    }
  }

  const fspIds = Array.from(new Set(fspIdByProject.values()))
  const nameById = new Map<string, string>()
  for (let i = 0; i < fspIds.length; i += 200) {
    const chunk = fspIds.slice(i, i + 200)
    const { data, error } = await supabase.from('fsps').select('id, name').in('id', chunk)
    if (error) {
      console.warn('[compliance-digest] fsps name lookup failed:', error.message)
      break
    }
    for (const f of data || []) nameById.set(f.id, f.name || f.id)
  }

  for (const [projectId, fspId] of fspIdByProject) {
    out.set(projectId, nameById.get(fspId) || fspId)
  }
  return out
}

function formatSlackRow(r: DigestRow): string {
  const id = r.errId || r.projectId
  const names = (r.payeeNames.join(', ') || '—').slice(0, 80)
  const fsp = r.fspName || '—'
  const when = r.committedAt || 'unknown (legacy)'
  const by = r.committedBy || '—'
  return (
    `• *<${r.link}|${id}>* — ${names}\n` +
    `    FSP: ${fsp} | Committed: ${when} by ${by}\n` +
    `    Status: ${r.workflowStatus}`
  )
}

/** One message per day: totals by stage, the most recent F1s, and a link for the rest. */
function buildSlackMessage(rows: DigestRow[]): string {
  const byStage = new Map<string, number>()
  for (const r of rows) byStage.set(r.workflowStatus, (byStage.get(r.workflowStatus) || 0) + 1)
  const stageLines = Array.from(byStage.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([stage, n]) => `• ${stage}: *${n}*`)

  const recent = rows
    .slice()
    .sort((a, b) => (Date.parse(b.committedAt || '') || 0) - (Date.parse(a.committedAt || '') || 0))

  const mentions = (process.env.COMPLIANCE_DIGEST_MENTION_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => `<@${id}>`)
    .join(' ')

  const header = [
    `:clipboard: *Compliance daily digest*${mentions ? ` ${mentions}` : ''}`,
    `*${rows.length}* F1(s) from 1 Jul 2026 onward have payment committed / FSP assigned but are not Cleared yet.`,
    ...stageLines,
    `<${appBaseUrl()}/err-portal/compliance|Open the compliance page> to work through them.`,
  ].join('\n')

  const lines: string[] = []
  for (const r of recent.slice(0, ROWS_IN_MESSAGE)) {
    const line = formatSlackRow(r)
    if ((header + lines.join('\n\n') + line).length > SLACK_MESSAGE_CHARS) break
    lines.push(line)
  }
  const hasCommitDates = recent.some((r) => r.committedAt)
  const listTitle = hasCommitDates
    ? `*Most recently committed ${lines.length}:*`
    : `*${lines.length} of ${rows.length}:*`
  const remaining = rows.length - lines.length
  const footer = remaining > 0 ? `\n\n_+${remaining} more on the compliance page._` : ''
  return `${header}\n\n${listTitle}\n\n${lines.join('\n\n')}${footer}`
}

/**
 * Send one consolidated daily digest via Slack (same channel/token as other
 * compliance alerts). No-ops when there is nothing to report.
 */
export async function sendComplianceCommittedDigest(
  supabase: SupabaseClient
): Promise<{ sent: boolean; count: number; detail: string }> {
  const rows = await loadCommittedBeforeClearedRows(supabase)
  if (rows.length === 0) {
    return { sent: false, count: 0, detail: 'Nothing to report — no Slack message sent' }
  }

  const result = await postComplianceSlack(buildSlackMessage(rows))
  if (!result.sent) {
    return { sent: false, count: rows.length, detail: result.detail }
  }
  return { sent: true, count: rows.length, detail: `Slack digest posted (${rows.length} F1s)` }
}
