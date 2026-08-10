import { NextResponse } from 'next/server'
import { PassThrough, Readable } from 'stream'
import archiver from 'archiver'
import { requirePermission } from '@/lib/requirePermission'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { collectArchiveFiles, safeName, type ArchiveProjectRow } from '@/lib/dataArchive'
import { resolveProjectCompletionDate } from '@/lib/projectStatus'

export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_PROJECTS_PER_EXPORT = 500

function csvCell(value: string | null | undefined): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function monthFolder(completedAt: string | null): string {
  if (!completedAt) return 'undated'
  const d = new Date(completedAt)
  if (isNaN(d.getTime())) return 'undated'
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export async function POST(req: Request) {
  const perm = await requirePermission('data_archive_download')
  if (perm instanceof NextResponse) return perm

  let projectIds: string[]
  try {
    const body = await req.json()
    projectIds = Array.isArray(body?.project_ids) ? body.project_ids.filter((id: unknown) => typeof id === 'string') : []
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
  if (!projectIds.length) {
    return NextResponse.json({ error: 'project_ids is required' }, { status: 400 })
  }
  if (projectIds.length > MAX_PROJECTS_PER_EXPORT) {
    return NextResponse.json(
      { error: `Too many projects in one export (max ${MAX_PROJECTS_PER_EXPORT}). Narrow the project completion date or grant name filter.` },
      { status: 400 }
    )
  }

  const supabase = getSupabaseAdmin()

  const projects: any[] = []
  for (let i = 0; i < projectIds.length; i += 80) {
    const { data, error } = await supabase
      .from('err_projects')
      .select(`
        id,
        grant_id,
        grant_serial_id,
        state,
        status,
        completed_at,
        date_report_completed,
        file_key,
        approval_file_key,
        mou_id,
        emergency_rooms ( err_code, name ),
        donors ( name, short_name ),
        grant_calls ( name, shortname )
      `)
      .in('id', projectIds.slice(i, i + 80))
      .eq('status', 'completed')
    if (error) {
      console.error('[data-archive/export] project fetch failed', error)
      return NextResponse.json({ error: 'Failed to load projects' }, { status: 500 })
    }
    projects.push(...(data || []))
  }
  if (!projects.length) {
    return NextResponse.json({ error: 'No completed projects found for the given ids' }, { status: 404 })
  }

  const filesByProject = await collectArchiveFiles(supabase, projects as unknown as ArchiveProjectRow[])
  const exportedAt = new Date().toISOString()

  const archive = archiver('zip', { zlib: { level: 6 } })
  const pass = new PassThrough()
  archive.on('warning', (err: unknown) => console.warn('[data-archive/export] archiver warning', err))
  archive.on('error', (err: Error) => {
    console.error('[data-archive/export] archiver error', err)
    pass.destroy(err)
  })
  archive.pipe(pass)

  // Fill the archive asynchronously while the response streams.
  ;(async () => {
    for (const p of projects) {
      // Prefer full grant call name; fall back to full donor name (no short abbreviations).
      const grantFolder = safeName(p.grant_calls?.name || p.donors?.name || 'Unknown-Grant')
      const serialFolder = safeName(p.grant_id || p.grant_serial_id || p.id)
      const projectCompletionDate = resolveProjectCompletionDate(p.completed_at, p.date_report_completed)
      const folder = `${monthFolder(projectCompletionDate)}/${grantFolder}/${serialFolder}`

      const manifestRows: string[] = [
        ['form', 'file_name', 'original_storage_path', 'status', 'grant_id', 'err_code', 'err_name', 'state', 'project_completion_date', 'exported_at']
          .join(',')
      ]

      for (const f of filesByProject[p.id] || []) {
        let status = 'MISSING'
        if (f.storage_path) {
          try {
            const { data, error } = await supabase.storage.from('images').download(f.storage_path)
            if (error || !data) {
              status = 'DOWNLOAD_FAILED'
              console.warn('[data-archive/export] download failed', f.storage_path, error)
            } else {
              archive.append(Buffer.from(await data.arrayBuffer()), { name: `${folder}/${f.name}` })
              status = 'INCLUDED'
            }
          } catch (e) {
            status = 'DOWNLOAD_FAILED'
            console.warn('[data-archive/export] download threw', f.storage_path, e)
          }
        }
        manifestRows.push(
          [
            f.form,
            f.name,
            f.storage_path || '',
            status,
            p.grant_id || p.grant_serial_id || '',
            p.emergency_rooms?.err_code || '',
            p.emergency_rooms?.name || '',
            p.state || '',
            projectCompletionDate || '',
            exportedAt
          ].map(csvCell).join(',')
        )
      }

      // UTF-8 BOM so Arabic text opens correctly in Excel
      archive.append('\uFEFF' + manifestRows.join('\n'), { name: `${folder}/_manifest.csv` })
    }
    await archive.finalize()
  })().catch((err) => {
    console.error('[data-archive/export] stream fill failed', err)
    archive.abort()
    pass.destroy(err instanceof Error ? err : new Error(String(err)))
  })

  const filename = `data-archive-${exportedAt.slice(0, 10)}.zip`
  return new Response(Readable.toWeb(pass) as unknown as ReadableStream, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store'
    }
  })
}
