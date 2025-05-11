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