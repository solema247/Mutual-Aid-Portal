import type { SupabaseClient } from '@supabase/supabase-js'

export type MouPaymentFileRow = {
  id: string
  payment_confirmation_id: string
  file_path: string
  original_name: string
  file_type: string | null
  file_size: number | null
  uploaded_by: string | null
  uploaded_at: string
}

export type MouPaymentConfirmationRow = {
  id: string
  mou_id: string
  project_id: string
  exchange_rate: number | null
  transfer_date: string | null
  fsp_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
  files?: MouPaymentFileRow[]
}

export type ProjectPaymentSummary = {
  transfer_date: string | null
  exchange_rate: number | null
  file_path: string | null
  confirmation_count: number
}

function parseLegacyJsonMap(
  raw: string | null | undefined
): Record<string, { file_path?: string; exchange_rate?: number; transfer_date?: string }> {
  if (!raw || typeof raw !== 'string') return {}
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<
        string,
        { file_path?: string; exchange_rate?: number; transfer_date?: string }
      >
    }
  } catch {
    // ignore
  }
  return {}
}

/** Sanitize original filename for storage object keys. */
export function sanitizePaymentFileName(name: string): string {
  const base = (name || 'file').split(/[/\\]/).pop() || 'file'
  return base.replace(/[^\w.\-()+ ]+/g, '_').slice(0, 180)
}

export function buildPaymentFileStoragePath(opts: {
  mouId: string
  projectId: string
  confirmationId: string
  originalName: string
  uuid?: string
}): string {
  const id =
    opts.uuid ||
    (typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`)
  const safe = sanitizePaymentFileName(opts.originalName)
  return `f3-mous/${opts.mouId}/${opts.projectId}/${opts.confirmationId}/${id}-${safe}`
}

/**
 * Load confirmation summaries keyed by project_id.
 * Prefers relational rows; falls back to mous.payment_confirmation_file JSON for projects
 * with no relational rows yet.
 *
 * - transfer_date: earliest non-null (overdue / reporting windows)
 * - exchange_rate: latest non-null by transfer_date then created_at (F4 rate)
 * - file_path: first file of the earliest confirmation (legacy single-path consumers)
 */
export async function loadProjectPaymentSummaries(
  supabase: SupabaseClient,
  opts: {
    projectIds?: string[]
    mouIds?: string[]
  }
): Promise<Record<string, ProjectPaymentSummary>> {
  const out: Record<string, ProjectPaymentSummary> = {}
  const projectIds = opts.projectIds?.filter(Boolean) || []
  const mouIds = opts.mouIds?.filter(Boolean) || []

  let confirmations: MouPaymentConfirmationRow[] = []
  if (projectIds.length > 0 || mouIds.length > 0) {
    let query = supabase
      .from('mou_payment_confirmations')
      .select(
        'id, mou_id, project_id, exchange_rate, transfer_date, fsp_id, created_by, created_at, updated_at, mou_payment_files(id, payment_confirmation_id, file_path, original_name, file_type, file_size, uploaded_by, uploaded_at)'
      )
      .order('transfer_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true })

    if (projectIds.length > 0) {
      query = query.in('project_id', projectIds)
    } else if (mouIds.length > 0) {
      query = query.in('mou_id', mouIds)
    }

    const { data, error } = await query
    if (error) {
      // Table may not exist yet before migration — fall through to legacy JSON.
      console.warn('[mouPaymentConfirmations] relational load failed, using legacy', error.message)
    } else {
      confirmations = (data || []).map((row: any) => ({
        ...row,
        exchange_rate:
          row.exchange_rate == null || Number.isNaN(Number(row.exchange_rate))
            ? null
            : Number(row.exchange_rate),
        files: Array.isArray(row.mou_payment_files) ? row.mou_payment_files : [],
      }))
    }
  }

  const byProject = new Map<string, MouPaymentConfirmationRow[]>()
  for (const c of confirmations) {
    const list = byProject.get(c.project_id) || []
    list.push(c)
    byProject.set(c.project_id, list)
  }

  for (const [projectId, list] of byProject) {
    const withDates = list.filter((c) => c.transfer_date)
    const earliestDate =
      withDates.length > 0
        ? withDates.reduce((a, b) =>
            String(a.transfer_date) <= String(b.transfer_date) ? a : b
          ).transfer_date
        : null

    const withRates = [...list]
      .filter((c) => c.exchange_rate != null && Number(c.exchange_rate) > 0)
      .sort((a, b) => {
        const da = a.transfer_date || ''
        const db = b.transfer_date || ''
        if (da !== db) return db.localeCompare(da)
        return String(b.created_at).localeCompare(String(a.created_at))
      })
    const latestRate = withRates[0]?.exchange_rate ?? null

    const earliestConf =
      withDates.length > 0
        ? withDates.reduce((a, b) =>
            String(a.transfer_date) <= String(b.transfer_date) ? a : b
          )
        : list[0]
    const firstFile =
      (earliestConf?.files || []).find((f) => f.file_path)?.file_path ||
      list.flatMap((c) => c.files || []).find((f) => f.file_path)?.file_path ||
      null

    out[projectId] = {
      transfer_date: earliestDate,
      exchange_rate: latestRate,
      file_path: firstFile,
      confirmation_count: list.length,
    }
  }

  // Legacy JSON fallback for projects / MOUs not yet migrated
  const needLegacyMouIds = new Set<string>(mouIds)
  if (projectIds.length > 0 && needLegacyMouIds.size === 0) {
    // fetch mou_ids for projects missing from relational map
    const missing = projectIds.filter((id) => !out[id])
    if (missing.length > 0) {
      const { data: projects } = await supabase
        .from('err_projects')
        .select('id, mou_id')
        .in('id', missing)
      for (const p of projects || []) {
        if ((p as any).mou_id) needLegacyMouIds.add((p as any).mou_id)
      }
    }
  }

  // Also fill gaps for projects that have relational data but missing fields? Prefer relational only.
  const legacyTargetProjects =
    projectIds.length > 0 ? projectIds.filter((id) => !out[id]) : null

  if (needLegacyMouIds.size > 0) {
    const { data: mousRows } = await supabase
      .from('mous')
      .select('id, exchange_rate, transfer_date, payment_confirmation_file')
      .in('id', Array.from(needLegacyMouIds))

    for (const mou of mousRows || []) {
      const raw = (mou as any).payment_confirmation_file as string | null
      const map = parseLegacyJsonMap(raw)
      const entries = Object.entries(map)
      if (entries.length > 0) {
        for (const [projectId, data] of entries) {
          if (legacyTargetProjects && !legacyTargetProjects.includes(projectId)) continue
          if (out[projectId]) continue
          const rate =
            data?.exchange_rate != null && !Number.isNaN(Number(data.exchange_rate))
              ? Number(data.exchange_rate)
              : null
          out[projectId] = {
            transfer_date: typeof data?.transfer_date === 'string' ? data.transfer_date : null,
            exchange_rate: rate && rate > 0 ? rate : null,
            file_path: typeof data?.file_path === 'string' ? data.file_path : null,
            confirmation_count:
              data?.file_path || data?.exchange_rate != null || data?.transfer_date ? 1 : 0,
          }
        }
      } else if (raw && !raw.trim().startsWith('{')) {
        // Legacy single path — apply to sole project of this MOU if needed
        const { data: projects } = await supabase
          .from('err_projects')
          .select('id')
          .eq('mou_id', (mou as any).id)
        if ((projects || []).length === 1) {
          const projectId = (projects as any[])[0].id as string
          if (!out[projectId] && (!legacyTargetProjects || legacyTargetProjects.includes(projectId))) {
            const mouRate = (mou as any).exchange_rate
            out[projectId] = {
              transfer_date: (mou as any).transfer_date || null,
              exchange_rate:
                typeof mouRate === 'number' && mouRate > 0 ? mouRate : null,
              file_path: raw.trim(),
              confirmation_count: 1,
            }
          }
        }
      }
    }
  }

  return out
}

const CONFIRMED_ID_CHUNK = 200

/** Project ids with at least one confirmation (relational preferred, legacy JSON fallback). */
export function confirmedProjectIdsFromSummaries(
  summaries: Record<string, ProjectPaymentSummary>
): Set<string> {
  const ids = new Set<string>()
  for (const [projectId, summary] of Object.entries(summaries)) {
    if ((summary.confirmation_count ?? 0) > 0) ids.add(projectId)
  }
  return ids
}

/**
 * Load confirmed project ids using the same payment-confirmation rules as F3
 * (`mou_payment_confirmations`, with `mous.payment_confirmation_file` fallback).
 */
export async function loadConfirmedProjectIds(
  supabase: SupabaseClient,
  opts: {
    projectIds?: string[]
    mouIds?: string[]
  }
): Promise<Set<string>> {
  const projectIds = opts.projectIds?.filter(Boolean) || []
  const mouIds = opts.mouIds?.filter(Boolean) || []
  if (projectIds.length === 0 && mouIds.length === 0) return new Set()

  const keys = mouIds.length > 0 ? mouIds : projectIds
  const useMouIds = mouIds.length > 0
  const confirmed = new Set<string>()

  for (let i = 0; i < keys.length; i += CONFIRMED_ID_CHUNK) {
    const chunk = keys.slice(i, i + CONFIRMED_ID_CHUNK)
    const summaries = await loadProjectPaymentSummaries(
      supabase,
      useMouIds ? { mouIds: chunk } : { projectIds: chunk }
    )
    for (const id of confirmedProjectIdsFromSummaries(summaries)) {
      confirmed.add(id)
    }
  }
  return confirmed
}

export async function listPaymentConfirmationsForMou(
  supabase: SupabaseClient,
  mouId: string,
  projectId?: string | null
): Promise<MouPaymentConfirmationRow[]> {
  let query = supabase
    .from('mou_payment_confirmations')
    .select(
      'id, mou_id, project_id, exchange_rate, transfer_date, fsp_id, created_by, created_at, updated_at, mou_payment_files(id, payment_confirmation_id, file_path, original_name, file_type, file_size, uploaded_by, uploaded_at)'
    )
    .eq('mou_id', mouId)
    .order('transfer_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true })

  if (projectId) {
    query = query.eq('project_id', projectId)
  }

  const { data, error } = await query
  if (error) {
    // Migration not applied / schema cache stale — return empty so the modal can still
    // show projects and the Add Payment form instead of wiping the UI.
    console.warn(
      '[listPaymentConfirmationsForMou] relational query failed:',
      error.message
    )
    return []
  }

  return (data || []).map((row: any) => ({
    id: row.id,
    mou_id: row.mou_id,
    project_id: row.project_id,
    exchange_rate:
      row.exchange_rate == null || Number.isNaN(Number(row.exchange_rate))
        ? null
        : Number(row.exchange_rate),
    transfer_date: row.transfer_date,
    fsp_id: row.fsp_id ?? null,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    files: (Array.isArray(row.mou_payment_files) ? row.mou_payment_files : []).sort(
      (a: MouPaymentFileRow, b: MouPaymentFileRow) =>
        String(a.uploaded_at).localeCompare(String(b.uploaded_at))
    ),
  }))
}

export async function getSessionUserLabel(
  supabase: SupabaseClient
): Promise<string | null> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.user?.email || session?.user?.id || null
}
