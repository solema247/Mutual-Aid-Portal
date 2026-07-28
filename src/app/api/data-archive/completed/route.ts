import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { collectArchiveFiles, type ArchiveProjectRow } from '@/lib/dataArchive'

const PROJECT_SELECT = `
  id,
  grant_id,
  grant_serial_id,
  state,
  completed_at,
  file_key,
  approval_file_key,
  mou_id,
  donor_id,
  grant_call_id,
  emergency_rooms ( err_code, name ),
  donors ( id, name, short_name ),
  grant_calls ( id, name, shortname )
`

/** Resolve month=YYYY-MM or from/to (inclusive dates) into an ISO [start, end) range. */
function resolveRange(url: URL): { start: string; end: string } | null {
  const month = url.searchParams.get('month')
  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [y, m] = month.split('-').map(Number)
    const start = new Date(Date.UTC(y, m - 1, 1))
    const end = new Date(Date.UTC(y, m, 1))
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const from = url.searchParams.get('from')
  const to = url.searchParams.get('to')
  if (from && to) {
    const start = new Date(`${from}T00:00:00.000Z`)
    const endExclusive = new Date(`${to}T00:00:00.000Z`)
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1)
    if (!isNaN(start.getTime()) && !isNaN(endExclusive.getTime())) {
      return { start: start.toISOString(), end: endExclusive.toISOString() }
    }
  }
  return null
}

export async function GET(req: Request) {
  const perm = await requirePermission('data_archive_view_page')
  if (perm instanceof NextResponse) return perm

  try {
    const supabase = getSupabaseRouteClient()
    const url = new URL(req.url)
    const range = resolveRange(url)
    const includeUndated = url.searchParams.get('include_undated') === 'true'
    const donorId = url.searchParams.get('donor_id')
    const grantCallId = url.searchParams.get('grant_call_id')

    let query = supabase
      .from('err_projects')
      .select(PROJECT_SELECT)
      .eq('status', 'completed')

    if (range) {
      if (includeUndated) {
        query = query.or(
          `and(completed_at.gte.${range.start},completed_at.lt.${range.end}),completed_at.is.null`
        )
      } else {
        query = query.gte('completed_at', range.start).lt('completed_at', range.end)
      }
    }
    if (donorId) query = query.eq('donor_id', donorId)
    if (grantCallId) query = query.eq('grant_call_id', grantCallId)

    const { data: projects, error } = await query.order('completed_at', {
      ascending: false,
      nullsFirst: false
    })
    if (error) throw error

    const files = await collectArchiveFiles(supabase, (projects || []) as unknown as ArchiveProjectRow[])

    const rows = (projects || []).map((p: any) => {
      const projectFiles = files[p.id] || []
      const has = (form: string, nameStartsWith: string) =>
        projectFiles.some((f) => f.form === form && f.name.startsWith(nameStartsWith) && !!f.storage_path)
      const count = (form: string) => projectFiles.filter((f) => f.form === form && !!f.storage_path).length
      return {
        id: p.id,
        grant_id: p.grant_id || null,
        grant_serial_id: p.grant_serial_id || null,
        state: p.state || null,
        completed_at: p.completed_at || null,
        err_code: p.emergency_rooms?.err_code || null,
        err_name: p.emergency_rooms?.name || null,
        donor_id: p.donors?.id || p.donor_id || null,
        donor_name: p.donors?.name || null,
        donor_short_name: p.donors?.short_name || null,
        grant_call_id: p.grant_calls?.id || p.grant_call_id || null,
        grant_call_name: p.grant_calls?.name || null,
        grant_call_shortname: p.grant_calls?.shortname || null,
        files: {
          f1: has('F1', 'F1_workplan'),
          f2: has('F2', 'F2_approval'),
          f3_mou: has('F3', 'F3_MOU.'),
          f3_signed: has('F3', 'F3_MOU_signed'),
          payment_confirmation: has('F3', 'F3_payment_confirmation'),
          f4_count: count('F4'),
          f5_count: count('F5')
        }
      }
    })

    return NextResponse.json({ rows })
  } catch (e) {
    console.error('[data-archive/completed] error', e)
    return NextResponse.json({ error: 'Failed to load completed projects' }, { status: 500 })
  }
}
