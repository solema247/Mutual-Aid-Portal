import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * GET /api/notifications
 * Returns notifications for the current user.
 * Query: unread_only=1 (optional), limit (optional, default 50).
 */
export async function GET(request: Request) {
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

    const { searchParams } = new URL(request.url)
    const unreadOnly = searchParams.get('unread_only') === '1'
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 100)

    let query = supabase
      .from('user_notifications')
      .select('id, type, title, body, link, entity_type, entity_id, read_at, created_at')
      .eq('user_id', userRow.id)
      .order('created_at', { ascending: false })
      .limit(limit)
    if (unreadOnly) query = query.is('read_at', null)

    const { data: rows, error } = await query
    if (error) throw error

    let unreadCount = 0
    const { count } = await supabase
      .from('user_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userRow.id)
      .is('read_at', null)
    unreadCount = count ?? 0

    return NextResponse.json({ notifications: rows || [], unread_count: unreadCount })
  } catch (e) {
    console.error('Notifications GET error', e)
    return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
  }
}

/**
 * PATCH /api/notifications
 * Body: { mark_all_read: true } to mark all notifications as read for the current user.
 */
export async function PATCH(request: Request) {
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

    const body = await request.json().catch(() => ({}))
    if (body?.mark_all_read) {
      const { error } = await supabase
        .from('user_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('user_id', userRow.id)
        .is('read_at', null)
      if (error) throw error
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  } catch (e) {
    console.error('Notifications PATCH error', e)
    return NextResponse.json({ error: 'Failed to update notifications' }, { status: 500 })
  }
}
