import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  coordinatorWriteForbiddenResponse,
  getUserOrgScope,
  isDisclosedCoordinator,
} from '@/lib/canvas/orgScope'

/** POST /api/f2/workplans/send-back */
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (isDisclosedCoordinator(await getUserOrgScope())) return coordinatorWriteForbiddenResponse()

    const body = await request.json()
    const workplanIds = body.workplan_ids as string[] | undefined
    const reason = body.reason as string | undefined
    if (!workplanIds?.length || !reason) {
      return NextResponse.json({ error: 'workplan_ids and reason are required' }, { status: 400 })
    }

    const { error: updateError } = await supabase
      .from('err_projects')
      .update({ status: 'pending' })
      .in('id', workplanIds)
    if (updateError) throw updateError

    const { data: existingFeedback, error: feedbackError } = await supabase
      .from('project_feedback')
      .select('project_id, iteration_number')
      .in('project_id', workplanIds)
    if (feedbackError) {
      console.error('Error fetching existing feedback:', feedbackError)
    }

    const feedbackEntries = workplanIds.map((projectId) => {
      const existing = existingFeedback?.filter((f) => f.project_id === projectId) || []
      return {
        project_id: projectId,
        feedback_text: reason,
        feedback_status: 'pending_changes',
        created_by: session.user.id,
        iteration_number: existing.length + 1,
      }
    })

    const { error: insertFeedbackError } = await supabase
      .from('project_feedback')
      .insert(feedbackEntries)
    if (insertFeedbackError) {
      console.error('Error creating feedback entries:', insertFeedbackError)
    }

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/f2/workplans/send-back:', e)
    return NextResponse.json({ error: 'Failed to send back workplans' }, { status: 500 })
  }
}
