import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userData, error } = await supabase
      .from('users')
      .select('id, display_name, role, status, err_id, created_at, updated_at')
      .eq('auth_user_id', session.user.id)
      .single()

    if (error) {
      console.error('Error fetching user data:', error)
      return NextResponse.json({ error: 'Failed to fetch user data' }, { status: 500 })
    }

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Explicitly exclude sensitive fields - only return safe data
    return NextResponse.json({
      id: userData.id,
      display_name: userData.display_name,
      role: userData.role,
      status: userData.status,
      err_id: userData.err_id,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    })
  } catch (error) {
    console.error('Unexpected error in /api/users/me:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

