import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

type RouteContext = { params: { id: string } }

async function requirePortalProject(supabase: ReturnType<typeof getSupabaseRouteClient>, projectId: string) {
  if (!projectId || projectId.startsWith('historical_')) {
    return { ok: false as const, response: NextResponse.json({ error: 'Supporting documents are only available for portal projects' }, { status: 400 }) }
  }
  const { data: project, error } = await supabase
    .from('err_projects')
    .select('id')
    .eq('id', projectId)
    .maybeSingle()
  if (error) throw error
  if (!project) {
    return { ok: false as const, response: NextResponse.json({ error: 'Project not found' }, { status: 404 }) }
  }
  return { ok: true as const, project }
}

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const projectId = params.id
    const check = await requirePortalProject(supabase, projectId)
    if (!check.ok) return check.response

    const { data, error } = await supabase
      .from('err_project_documents')
      .select('id, project_id, file_name, file_key, uploaded_at, uploaded_by')
      .eq('project_id', projectId)
      .order('uploaded_at', { ascending: false })

    if (error) {
      console.error('[projects/documents GET]', error)
      return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 })
    }

    return NextResponse.json({ documents: data || [] })
  } catch (e) {
    console.error('[projects/documents GET]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/**
 * Register a supporting document after the client has uploaded the file to storage.
 * Body: { file_name: string, file_key: string }
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const projectId = params.id
    const check = await requirePortalProject(supabase, projectId)
    if (!check.ok) return check.response

    const body = await request.json()
    const file_name = typeof body?.file_name === 'string' ? body.file_name.trim() : ''
    const file_key = typeof body?.file_key === 'string' ? body.file_key.trim() : ''
    if (!file_name || !file_key) {
      return NextResponse.json({ error: 'file_name and file_key are required' }, { status: 400 })
    }

    const expectedPrefix = `projects/${projectId}/supporting/`
    if (!file_key.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Invalid file_key for this project' }, { status: 400 })
    }

    let uploaded_by: string | null = null
    try {
      const { data: auth } = await supabase.auth.getUser()
      uploaded_by = auth?.user?.email || auth?.user?.id || null
    } catch {
      /* optional */
    }

    const { data, error } = await supabase
      .from('err_project_documents')
      .insert({
        project_id: projectId,
        file_name,
        file_key,
        uploaded_by,
      })
      .select('id, project_id, file_name, file_key, uploaded_at, uploaded_by')
      .single()

    if (error) {
      console.error('[projects/documents POST]', error)
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 })
    }

    return NextResponse.json({ document: data }, { status: 201 })
  } catch (e) {
    console.error('[projects/documents POST]', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
