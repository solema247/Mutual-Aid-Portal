import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function PUT(
  request: Request,
  { params }: { params: { userId: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    
    // Get current user session
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: currentUser, error: userError } = await supabase
      .from('users')
      .select('role')
      .eq('auth_user_id', session.user.id)
      .single()

    if (userError || !currentUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (currentUser.role !== 'admin' && currentUser.role !== 'superadmin' && currentUser.role !== 'support') {
      return NextResponse.json({ error: 'Forbidden - Admin, Superadmin or Support only' }, { status: 403 })
    }

    // Get the target user to check their current role
    const { data: targetUser, error: targetUserError } = await supabase
      .from('users')
      .select('role')
      .eq('id', params.userId)
      .single()

    if (targetUserError || !targetUser) {
      return NextResponse.json({ error: 'Target user not found' }, { status: 404 })
    }

    // Parse request body
    const body = await request.json()
    const { role, can_see_all_states, visible_states } = body

    // Validate inputs
    if (role && !['support', 'superadmin', 'admin', 'state_err', 'base_err'].includes(role)) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 })
    }

    if (targetUser.role === 'superadmin' && role && role !== 'superadmin' && currentUser.role !== 'support') {
      return NextResponse.json({ error: 'Only support can change superadmin role' }, { status: 403 })
    }
    if (role === 'superadmin' && currentUser.role !== 'support') {
      return NextResponse.json({ error: 'Only support can assign superadmin role' }, { status: 403 })
    }

    if (role === 'admin' && currentUser.role !== 'superadmin' && currentUser.role !== 'support') {
      return NextResponse.json({ error: 'Only superadmin or support can set admin role' }, { status: 403 })
    }

    if (targetUser.role === 'admin' && role && role !== 'admin' && currentUser.role !== 'superadmin' && currentUser.role !== 'support') {
      return NextResponse.json({ error: 'Only superadmin or support can change admin role' }, { status: 403 })
    }

    if (targetUser.role === 'superadmin' && (can_see_all_states !== undefined || visible_states !== undefined) && currentUser.role !== 'support') {
      return NextResponse.json({ error: 'Only support can change state access for superadmin users' }, { status: 403 })
    }
    if (targetUser.role === 'admin' && (can_see_all_states !== undefined || visible_states !== undefined) && currentUser.role !== 'superadmin' && currentUser.role !== 'support') {
      return NextResponse.json({ error: 'Only superadmin or support can change state access for admin users' }, { status: 403 })
    }

    if (can_see_all_states !== undefined && typeof can_see_all_states !== 'boolean') {
      return NextResponse.json({ error: 'can_see_all_states must be a boolean' }, { status: 400 })
    }

    if (visible_states !== undefined && !Array.isArray(visible_states)) {
      return NextResponse.json({ error: 'visible_states must be an array' }, { status: 400 })
    }

    // Build update object
    const updateData: any = {
      updated_at: new Date().toISOString()
    }

    if (role !== undefined) {
      updateData.role = role
    }

    if (can_see_all_states !== undefined) {
      updateData.can_see_all_states = can_see_all_states
    }

    if (visible_states !== undefined) {
      updateData.visible_states = visible_states
    }

    // Update user
    const { data: updatedUser, error: updateError } = await supabase
      .from('users')
      .update(updateData)
      .eq('id', params.userId)
      .select()
      .single()

    if (updateError) {
      console.error('Error updating user access rights:', updateError)
      return NextResponse.json({ error: 'Failed to update user access rights' }, { status: 500 })
    }

    return NextResponse.json(updatedUser)
  } catch (error) {
    console.error('Unexpected error in access-rights update:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

