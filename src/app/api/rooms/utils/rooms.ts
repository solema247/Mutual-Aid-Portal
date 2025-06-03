import { supabase } from '@/lib/supabaseClient'
import { RoomWithState } from '../types/rooms'

interface StateRef {
  id: string;
  state_name: string;
}

export async function getPendingRooms(currentUserRole?: string, currentUserErrId?: string | null): Promise<RoomWithState[]> {
  let query = supabase
    .from('emergency_rooms')
    .select(`
      *,
      state:states!emergency_rooms_state_reference_fkey(
        id,
        state_name,
        locality,
        state_name_ar,
        locality_ar
      )
    `)
    .eq('status', 'inactive')
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

    if (currentERR?.state?.state_name) {
      // Get all state references for this state name
      const { data: stateRefs } = await supabase
        .from('states')
        .select('id')
        .eq('state_name', currentERR.state.state_name)

      if (stateRefs && stateRefs.length > 0) {
        const stateIds = stateRefs.map(ref => ref.id)
        query = query.in('state_reference', stateIds)
      }
    }
  }

  const { data: rooms, error } = await query

  if (error) {
    console.error('Error fetching pending rooms:', error)
    throw error
  }

  return rooms || []
}

export async function approveRoom(roomId: string): Promise<void> {
  const { error } = await supabase
    .from('emergency_rooms')
    .update({ status: 'active' })
    .eq('id', roomId)

  if (error) {
    console.error('Error approving room:', error)
    throw error
  }
}

export async function declineRoom(roomId: string): Promise<void> {
  const { error } = await supabase
    .from('emergency_rooms')
    .delete()
    .eq('id', roomId)

  if (error) {
    console.error('Error declining room:', error)
    throw error
  }
}

interface GetActiveRoomsParams {
  page: number
  pageSize: number
  type?: 'state' | 'base'
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  currentUserRole?: string
  currentUserErrId?: string | null
}

interface GetActiveRoomsResult {
  rooms: RoomWithState[]
  total: number
}

export async function getActiveRooms({
  page = 1,
  pageSize = 20,
  type,
  sortBy = 'created_at',
  sortOrder = 'desc',
  currentUserRole,
  currentUserErrId
}: GetActiveRoomsParams): Promise<GetActiveRoomsResult> {
  // Build the base query
  let query = supabase
    .from('emergency_rooms')
    .select(`
      *,
      state:states!emergency_rooms_state_reference_fkey(
        id,
        state_name,
        locality,
        state_name_ar,
        locality_ar
      )
    `, { count: 'exact' })
    .eq('status', 'active')

  // Filter by type if specified
  if (type) {
    query = query.eq('type', type)
  }

  // Filter based on user role
  if (currentUserRole === 'state_err' && currentUserErrId) {
    // Get state reference for current user's ERR
    const { data: currentERR } = await supabase
      .from('emergency_rooms')
      .select('state_reference')
      .eq('id', currentUserErrId)
      .single()

    if (currentERR) {
      query = query.eq('state_reference', currentERR.state_reference)
    }
  }

  // Apply sorting
  query = query.order(sortBy, { ascending: sortOrder === 'asc' })

  // Apply pagination
  const from = (page - 1) * pageSize
  const to = from + pageSize - 1
  query = query.range(from, to)

  // Execute the query
  const { data: rooms, error, count } = await query

  if (error) {
    console.error('Error searching active rooms:', error)
    throw error
  }

  return {
    rooms: rooms || [],
    total: count || 0
  }
} 