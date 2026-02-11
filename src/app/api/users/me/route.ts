import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getAllowedFunctions } from '@/lib/permissions'

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('id, display_name, role, status, err_id, created_at, updated_at, can_see_all_states, visible_states')
      .eq('auth_user_id', session.user.id)
      .single()

    if (error) {
      console.error('Error fetching user data:', error)
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Parse visible_states if it's a string (JSON)
    let visibleStates = userData.visible_states
    if (typeof visibleStates === 'string') {
      try {
        visibleStates = JSON.parse(visibleStates)
      } catch (e) {
        visibleStates = []
      }
    }

    const allowed_functions = getAllowedFunctions({
      id: userData.id,
      role: userData.role,
    })

    // Explicitly exclude sensitive fields - only return safe data
    return NextResponse.json({
      id: userData.id,
      display_name: userData.display_name,
      role: userData.role,
      status: userData.status,
      err_id: userData.err_id,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
      can_see_all_states: userData.can_see_all_states ?? true,
      visible_states: visibleStates || [],
      allowed_functions,
    })
  } catch (error) {
    console.error('Unexpected error in /api/users/me:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

