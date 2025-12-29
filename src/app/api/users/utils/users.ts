import { supabase } from '@/lib/supabaseClient'
import { User } from '../types/users'

interface StateResponse {
  state: {
    state_name: string;
  }[];
}

interface EmergencyRoomWithState {
  state: {
    state_name: string;
  }
}

export async function getPendingUsers(currentUserRole: string, currentUserErrId: string | null): Promise<User[]> {
  let query = supabase
    .from('users')
    .select(`
      *,
      emergency_rooms!inner(
        id,
        name,
        name_ar,
        err_code,
        state:states!emergency_rooms_state_reference_fkey(
          id,
          state_name
        )
      )
    `)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

  // Filter based on role
  if (currentUserRole === 'state_err' && currentUserErrId) {
    // First get the state name for the current user's ERR
    const { data: currentERR } = await supabase
      .from('emergency_rooms')
      .select(`
        state:states!emergency_rooms_state_reference_fkey(
          state_name
        )
      `)
      .eq('id', currentUserErrId)
      .single()

    const stateName = (currentERR as StateResponse)?.state?.[0]?.state_name
    if (stateName) {
      // Get all state references for this state name
      const { data: stateRefs } = await supabase
        .from('states')
        .select('id')
        .eq('state_name', stateName)

      if (stateRefs && stateRefs.length > 0) {
        const stateIds = stateRefs.map(ref => ref.id)
        query = query.in('emergency_rooms.state_reference', stateIds)
      }
    }
  } else if (currentUserRole === 'base_err' && currentUserErrId) {
    query = query.eq('err_id', currentUserErrId)
  }

  const { data: users, error } = await query

  if (error) {
    console.error('Error fetching pending users:', error)
    throw error
  }

  return users || []
}

interface GetActiveUsersParams {
  page: number
  pageSize: number
  role?: 'admin' | 'state_err' | 'base_err'
  status?: 'active' | 'suspended'
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  currentUserRole: string
  currentUserErrId: string | null
}

interface GetActiveUsersResult {
  users: User[]
  total: number
}

export async function getActiveUsers({
  page = 1,
  pageSize = 20,
  role,
  status = 'active',
  sortBy = 'created_at',
  sortOrder = 'desc',
  currentUserRole,
  currentUserErrId
}: GetActiveUsersParams): Promise<GetActiveUsersResult> {
  let query = supabase
    .from('users')
    .select(`
      *,
      emergency_rooms(
        id,
        name,
        name_ar,
        err_code,
        state:states!emergency_rooms_state_reference_fkey(
          id,
          state_name
        )
      )
    `, { count: 'exact' })
    .neq('status', 'pending')

  // Apply role filter if specified
  if (role) {
    query = query.eq('role', role)
  }

  // Apply status filter
  if (status) {
    query = query.eq('status', status)
  }

  // Filter based on user role
  if (currentUserRole === 'state_err' && currentUserErrId) {
    // First get the state name for the current user's ERR
    const { data: currentERR } = await supabase
      .from('emergency_rooms')
      .select(`
        state:states!emergency_rooms_state_reference_fkey(
          state_name
        )
      `)
      .eq('id', currentUserErrId)
      .single()

    const stateName = (currentERR as StateResponse)?.state?.[0]?.state_name
    if (stateName) {
      // Get all state references for this state name
      const { data: stateRefs } = await supabase
        .from('states')
        .select('id')
        .eq('state_name', stateName)

      if (stateRefs && stateRefs.length > 0) {
        const stateIds = stateRefs.map(ref => ref.id)
        // Get all ERRs in these states
        const { data: errsInState } = await supabase
          .from('emergency_rooms')
          .select('id')
          .in('state_reference', stateIds)

        if (errsInState && errsInState.length > 0) {
          const errIds = errsInState.map(err => err.id)
          query = query.in('err_id', errIds)
        } else {
          // No ERRs in this state, so return empty result
          query = query.eq('id', '00000000-0000-0000-0000-000000000000') // Impossible ID to return empty
        }
      }
    }
  } else if (currentUserRole === 'base_err' && currentUserErrId) {
    query = query.eq('err_id', currentUserErrId)
  }

  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  const { data: users, error, count } = await query

  if (error) {
    console.error('Error fetching active users:', error)
    throw error
  }

  return {
    users: users || [],
    total: count || 0
  }
}

export async function approveUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ status: 'active' })
    .eq('id', userId)

  if (error) {
    console.error('Error approving user:', error)
    throw error
  }
}

export async function declineUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)

  if (error) {
    console.error('Error declining user:', error)
    throw error
  }
}

export async function suspendUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ 
      status: 'suspended',
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)

  if (error) {
    console.error('Error suspending user:', error)
    throw error
  }
}

export async function activateUser(userId: string): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ 
      status: 'active',
      updated_at: new Date().toISOString()
    })
    .eq('id', userId)

  if (error) {
    console.error('Error activating user:', error)
    throw error
  }
} 