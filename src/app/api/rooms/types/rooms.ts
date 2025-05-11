import { Database } from '@/lib/database.types'

export type EmergencyRoom = Database['public']['Tables']['emergency_rooms']['Row']
export type State = Database['public']['Tables']['states']['Row']

export interface RoomWithState extends EmergencyRoom {
  state?: State
}

export interface PendingRoomListItem {
  id: string
  name: string
  type: 'state' | 'base'
  stateName: string
  locality: string
  createdAt: string
  status: 'active' | 'inactive'
} 