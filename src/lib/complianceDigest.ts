import type { SupabaseClient } from '@supabase/supabase-js'
import { isPaymentAlreadyCommitted } from '@/lib/compliance'
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

/** Slack message soft limit — keep each chunk under this. */
const SLACK_CHUNK_CHARS = 3500
const ROWS_PER_CHUNK = 25

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
        temp_file_key
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
    } | null
    if (!p) continue
    if (!(p.file_key || p.temp_file_key)) continue
    if (p.status === 'completed' || p.status === 'declined') continue

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
        temp_file_key
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
    } | null
    if (!p) continue
    if (!(p.file_key || p.temp_file_key)) continue
    if (p.status === 'completed' || p.status === 'declined') continue
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

function buildSlackMessages(rows: DigestRow[]): string[] {
  const header = [
    ':clipboard: *Compliance daily digest*',
    `${rows.length} F1(s) with payment committed / FSP assigned before Clear.`,
    'Complete the normal Screening → Finance → History workflow. They leave the queue only when Cleared.',
    `<${appBaseUrl()}/err-portal/compliance|Open compliance page>`,
    ''
  ].join('\n')

  const messages: string[] = []
  let chunkRows: string[] = []
  let chunkStart = 0

  const flush = () => {
    if (chunkRows.length === 0) return
    const part =
      messages.length === 0
        ? header
        : `:clipboard: *Compliance daily digest* (cont. ${chunkStart + 1}–${chunkStart + chunkRows.length} of ${rows.length})\n\n`
    messages.push(part + chunkRows.join('\n\n'))
    chunkStart += chunkRows.length
    chunkRows = []
  }

  for (const r of rows) {
    const line = formatSlackRow(r)
    const next = [...chunkRows, line]
    const body = next.join('\n\n')
    if (
      chunkRows.length >= ROWS_PER_CHUNK ||
      (chunkRows.length > 0 && body.length > SLACK_CHUNK_CHARS)
    ) {
      flush()
    }
    chunkRows.push(line)
  }
  flush()
  return messages
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

  const messages = buildSlackMessages(rows)
  let sentCount = 0
  let lastDetail = ''
  for (const text of messages) {
    const result = await postComplianceSlack(text)
    lastDetail = result.detail
    if (result.sent) sentCount++
  }

  if (sentCount === 0) {
    return {
      sent: false,
      count: rows.length,
      detail: lastDetail || 'Slack not configured (SLACK_BOT_TOKEN / COMPLIANCE_ALERT_SLACK_CHANNEL)'
    }
  }

  return {
    sent: true,
    count: rows.length,
    detail: `Slack digest posted (${sentCount} message${sentCount === 1 ? '' : 's'}, ${rows.length} F1s)`
  }
}
