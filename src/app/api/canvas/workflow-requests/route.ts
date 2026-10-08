import { NextResponse } from 'next/server'
import { requireCanvasSession } from '@/lib/canvas/session'

export async function GET() {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { supabase, canvas } = session
  if (canvas.is_fallback) {
    return NextResponse.json({ requests: [], canvas_is_fallback: true })
  }

  const { data, error } = await supabase
    .from('workflow_requests')
    .select('id, title, body, status, created_at, updated_at, requested_by')
    .eq('organization_id', canvas.organization.id)
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[canvas/workflow-requests] GET', error)
    return NextResponse.json({ error: 'Failed to load requests' }, { status: 500 })
  }

  return NextResponse.json({ requests: data ?? [], canvas_is_fallback: false })
}

export async function POST(req: Request) {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { supabase, user, canvas } = session
  if (canvas.is_fallback) {
    return NextResponse.json(
      {
        error:
          'Canvas tables not available on this database. Apply sql/canvas scripts to production first.',
      },
      { status: 503 }
    )
  }

  let body: { title?: string; body?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const title = (body.title || '').trim()
  if (!title) {
    return NextResponse.json({ error: 'title required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('workflow_requests')
    .insert({
      organization_id: canvas.organization.id,
      requested_by: user.id,
      title,
      body: (body.body || '').trim() || null,
      status: 'requested',
    })
    .select('id, title, body, status, created_at, updated_at')
    .single()

  if (error) {
    console.error('[canvas/workflow-requests] POST', error)
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
  }

  return NextResponse.json({ request: data }, { status: 201 })
}
