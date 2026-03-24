import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * PATCH /api/notifications/[id]
 * Mark a single notification as read for the current user.
 */
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const {
      data: { session },
      error: sessionError
    } = await supabase.auth.getSession()
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userRow } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', session.user.id)
      .single()
    if (!userRow) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const id = params.id
    if (!id) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const { error } = await supabase
      .from('user_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userRow.id)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('Notification PATCH error', e)
    return NextResponse.json({ error: 'Failed to update notification' }, { status: 500 })
  }
}
