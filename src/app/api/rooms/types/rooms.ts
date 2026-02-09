import { Database } from '@/lib/database.types'

export type EmergencyRoom = Database['public']['Tables']['emergency_rooms']['Row']
export type State = Database['public']['Tables']['states']['Row']

export interface RoomWithState {
  id: string
  name: string
  name_ar: string | null
  type: 'state' | 'base'
  created_at: string
  status: 'active' | 'inactive'
  err_code: string | null
  state?: State
}

export interface PendingRoomListItem {
  id: string
  name: string
  name_ar: string | null
  type: 'state' | 'base'
  stateName: string
  locality: string
  createdAt: string
  status: 'active' | 'inactive'
} 