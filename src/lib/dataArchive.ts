import type { SupabaseClient } from '@supabase/supabase-js'

/** PostgREST `.in()` with hundreds of UUIDs can exceed URL limits and return empty data. */
const IN_BATCH = 80

function chunk<T>(items: T[]): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += IN_BATCH) {
    out.push(items.slice(i, i + IN_BATCH))
  }
  return out
}

async function fetchIn(
  supabase: SupabaseClient,
  table: string,
  select: string,
  column: string,
  ids: (string | number)[]
): Promise<any[]> {
  if (!ids.length) return []
  const rows: any[] = []
  for (const batch of chunk(ids)) {
    const { data, error } = await supabase.from(table).select(select).in(column, batch)
    if (error) throw error
    rows.push(...(data || []))
  }
  return rows
}

export interface ArchiveProjectRow {
  id: string
  file_key: string | null
  approval_file_key: string | null
  mou_id: string | null
}

export interface ArchiveFile {
  /** Form label used for grouping and manifest: F1 | F2 | F3 | F4 | F5 */
  form: 'F1' | 'F2' | 'F3' | 'F4' | 'F5'
  /** Target file name within the project's folder in the zip. */
  name: string
  /** Storage key in the `images` bucket, or null when the document is missing. */
  storage_path: string | null
}

function ext(path: string): string {
  const last = path.split('/').pop() || ''
  const dot = last.lastIndexOf('.')
  return dot > -1 ? last.slice(dot + 1).toLowerCase() : 'pdf'
}

/**
 * Parse mous.payment_confirmation_file, which is either a plain storage key (legacy)
 * or a JSON map of { [project_id]: { file_path, ... } }.
 */
export function paymentConfirmationPathForProject(
  raw: string | null | undefined,
  projectId: string
): string | null {
  if (!raw || typeof raw !== 'string') return null
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'string') return parsed.trim() || null
    if (parsed && typeof parsed === 'object') {
      const entry = (parsed as Record<string, { file_path?: unknown }>)[projectId]
      return typeof entry?.file_path === 'string' ? entry.file_path.trim() || null : null
    }
  } catch {
    // Legacy records store a single storage key rather than the per-project JSON map.
    return raw.trim() || null
  }
  return null
}

async function paymentConfirmationPathsByProject(
  supabase: SupabaseClient,
  projectIds: string[],
  mouById: Map<string, any>,
  projects: ArchiveProjectRow[]
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (projectIds.length === 0) return out

  try {
    const confRows = await fetchIn(
      supabase,
      'mou_payment_confirmations',
      'id, project_id',
      'project_id',
      projectIds
    )
    const confIds = confRows.map((c: any) => c.id).filter(Boolean)
    const confProjectById = new Map<string, string>(
      confRows.map((c: any) => [c.id, c.project_id])
    )
    if (confIds.length > 0) {
      const fileRows = await fetchIn(
        supabase,
        'mou_payment_files',
        'payment_confirmation_id, file_path',
        'payment_confirmation_id',
        confIds
      )
      for (const f of fileRows) {
        const pid = confProjectById.get(f.payment_confirmation_id)
        if (!pid || !f.file_path) continue
        const list = out.get(pid) || []
        list.push(f.file_path)
        out.set(pid, list)
      }
    }
  } catch (e) {
    console.warn('[dataArchive] relational payment files unavailable', e)
  }

  // Legacy JSON / single-path fallback for projects with no relational files
  for (const p of projects) {
    if ((out.get(p.id) || []).length > 0) continue
    const mou = p.mou_id ? mouById.get(p.mou_id) : null
    const legacy = mou
      ? paymentConfirmationPathForProject(mou.payment_confirmation_file, p.id)
      : null
    if (legacy) out.set(p.id, [legacy])
  }

  return out
}

/**
 * Collect all original document references (F1-F5 + payment confirmation) for a set of
 * completed projects. Missing documents are returned with storage_path = null so exports
 * can record them in the manifest and the UI can show availability gaps.
 */
export async function collectArchiveFiles(
  supabase: SupabaseClient,
  projects: ArchiveProjectRow[]
): Promise<Record<string, ArchiveFile[]>> {
  const projectIds = projects.map((p) => p.id)

  const mouIds = Array.from(new Set(projects.map((p) => p.mou_id).filter(Boolean))) as string[]
  const mous = await fetchIn(
    supabase,
    'mous',
    'id, file_key, signed_mou_file_key, payment_confirmation_file',
    'id',
    mouIds
  )
  const mouById = new Map<string, any>(mous.map((m: any) => [m.id, m]))

  const summaries = await fetchIn(supabase, 'err_summary', 'id, project_id', 'project_id', projectIds)
  const summaryIds = summaries.map((s: any) => s.id)
  const summaryProjectById = new Map<number, string>(summaries.map((s: any) => [s.id, s.project_id]))
  const f4Attachments = await fetchIn(
    supabase,
    'err_summary_attachments',
    'summary_id, file_key, file_type',
    'summary_id',
    summaryIds
  )

  const reports = await fetchIn(supabase, 'err_program_report', 'id, project_id', 'project_id', projectIds)
  const reportIds = reports.map((r: any) => r.id)
  const reportProjectById = new Map<string, string>(reports.map((r: any) => [r.id, r.project_id]))
  const f5Files = await fetchIn(
    supabase,
    'err_program_files',
    'report_id, file_url, file_name',
    'report_id',
    reportIds
  )

  const f4ByProject = new Map<string, string[]>()
  for (const a of f4Attachments) {
    const pid = summaryProjectById.get(a.summary_id)
    if (!pid || !a.file_key) continue
    const list = f4ByProject.get(pid) || []
    list.push(a.file_key)
    f4ByProject.set(pid, list)
  }

  const f5ByProject = new Map<string, string[]>()
  for (const f of f5Files) {
    const pid = reportProjectById.get(f.report_id)
    if (!pid || !f.file_url) continue
    const list = f5ByProject.get(pid) || []
    list.push(f.file_url)
    f5ByProject.set(pid, list)
  }

  const paymentPathsByProject = await paymentConfirmationPathsByProject(
    supabase,
    projectIds,
    mouById,
    projects
  )

  const out: Record<string, ArchiveFile[]> = {}
  for (const p of projects) {
    const files: ArchiveFile[] = []

    files.push({
      form: 'F1',
      name: p.file_key ? `F1_workplan.${ext(p.file_key)}` : 'F1_workplan',
      storage_path: p.file_key || null
    })
    files.push({
      form: 'F2',
      name: p.approval_file_key ? `F2_approval.${ext(p.approval_file_key)}` : 'F2_approval',
      storage_path: p.approval_file_key || null
    })

    const mou = p.mou_id ? mouById.get(p.mou_id) : null
    const mouGenerated: string | null = mou?.file_key || null
    const mouSigned: string | null = mou?.signed_mou_file_key || null
    const paymentPaths = paymentPathsByProject.get(p.id) || []
    files.push({
      form: 'F3',
      name: mouGenerated ? `F3_MOU.${ext(mouGenerated)}` : 'F3_MOU',
      storage_path: mouGenerated
    })
    files.push({
      form: 'F3',
      name: mouSigned ? `F3_MOU_signed.${ext(mouSigned)}` : 'F3_MOU_signed',
      storage_path: mouSigned
    })
    if (paymentPaths.length === 0) {
      files.push({
        form: 'F3',
        name: 'F3_payment_confirmation',
        storage_path: null,
      })
    } else {
      paymentPaths.forEach((path, i) => {
        const suffix = paymentPaths.length > 1 ? `_${i + 1}` : ''
        files.push({
          form: 'F3',
          name: `F3_payment_confirmation${suffix}.${ext(path)}`,
          storage_path: path,
        })
      })
    }

    const f4Paths = f4ByProject.get(p.id) || []
    if (f4Paths.length === 0) {
      files.push({ form: 'F4', name: 'F4_financial_report', storage_path: null })
    } else {
      f4Paths.forEach((path, i) => {
        const suffix = f4Paths.length > 1 ? `_${i + 1}` : ''
        files.push({ form: 'F4', name: `F4_financial_report${suffix}.${ext(path)}`, storage_path: path })
      })
    }

    const f5Paths = f5ByProject.get(p.id) || []
    if (f5Paths.length === 0) {
      files.push({ form: 'F5', name: 'F5_program_report', storage_path: null })
    } else {
      f5Paths.forEach((path, i) => {
        const suffix = f5Paths.length > 1 ? `_${i + 1}` : ''
        files.push({ form: 'F5', name: `F5_program_report${suffix}.${ext(path)}`, storage_path: path })
      })
    }

    out[p.id] = files
  }
  return out
}

/** Sanitize a string for use as a zip folder or file name. */
export function safeName(value: string | null | undefined, fallback = 'Unknown'): string {
  const s = (value || '').toString().trim()
  if (!s) return fallback
  return s.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').trim()
}
