import { supabase } from '@/lib/supabaseClient'
import { RoomWithState } from '../types/rooms'

export async function getPendingRooms(): Promise<RoomWithState[]> {
  const { data: rooms, error } = await supabase
    .from('emergency_rooms')
    .select(`
      *,
      state:states(
        id,
        state_name,
        locality,
        state_name_ar,
        locality_ar
      )
    `)
    .eq('status', 'inactive')
    .order('created_at', { ascending: false })

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
  stateId?: string
  type?: 'state' | 'base'
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

interface GetActiveRoomsResult {
  rooms: RoomWithState[]
  total: number
}

// Search active rooms with a simpler approach
export async function getActiveRooms({
  page = 1,
  pageSize = 20,
  stateId,
  type,
  sortBy = 'created_at',
  sortOrder = 'desc'
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

  // Filter by state if specified
  if (stateId) {
    query = query.eq('state_reference', stateId)
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