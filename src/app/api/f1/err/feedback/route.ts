import { NextResponse } from 'next/server'
import {
  assertPermission,
  getRouteHandlerAuth,
  isErrSubmissionSource
} from '@/lib/routeHandlerAuth'
import { z } from 'zod'

const bodySchema = z.object({
  project_id: z.string().uuid(),
  feedback_text: z.string(),
  action: z.enum(['approve', 'feedback', 'decline'])
}).strict()

export async function POST (request: Request) {
  try {
    const auth = await getRouteHandlerAuth()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    assertPermission(auth, 'f1_approve')

    let raw: unknown
    try {
      raw = await request.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const parsed = bodySchema.safeParse(raw)
    if (!parsed.success) {
      return NextResponse.json({ error: 'Validation failed', details: parsed.error.flatten() }, { status: 400 })
    }

    const { project_id, feedback_text, action } = parsed.data

    const { data: project, error: projErr } = await auth.supabase
      .from('err_projects')
      .select('id, source, version, status')
      .eq('id', project_id)
      .single()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    if (!isErrSubmissionSource(project.source as string | null)) {
      return NextResponse.json({ error: 'Invalid project for ERR submissions' }, { status: 400 })
    }

    const newStatus =
      action === 'approve' ? 'approved' : action === 'decline' ? 'declined' : 'feedback'

    const { count, error: countErr } = await auth.supabase
      .from('project_feedback')
      .select('*', { count: 'exact', head: true })
      .eq('project_id', project_id)

    if (countErr) {
      console.error(countErr)
      return NextResponse.json({ error: 'Failed to load feedback count' }, { status: 500 })
    }

    const iteration_number = (count ?? 0) + 1

    const { data: feedbackData, error: feedbackError } = await auth.supabase
      .from('project_feedback')
      .insert({
        project_id,
        feedback_text: feedback_text,
        feedback_status: action === 'approve' ? 'resolved' : 'pending_changes',
        created_by: auth.dbUser.id,
        iteration_number
      })
      .select()
      .single()

    if (feedbackError || !feedbackData) {
      console.error(feedbackError)
      return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
    }

    const nextVersion = (typeof project.version === 'number' ? project.version : 1) + 1

    const { error: projectError } = await auth.supabase
      .from('err_projects')
      .update({
        status: newStatus,
        current_feedback_id: feedbackData.id,
        version: nextVersion
      })
      .eq('id', project_id)

    if (projectError) {
      console.error(projectError)
      return NextResponse.json({ error: 'Failed to update project' }, { status: 500 })
    }

    return NextResponse.json({ success: true, feedback_id: feedbackData.id })
  } catch (e: unknown) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('POST /api/f1/err/feedback:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
