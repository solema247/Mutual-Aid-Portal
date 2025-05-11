import { Database } from '@/lib/database.types'

export type User = Database['public']['Tables']['users']['Row']

export interface PendingUserListItem {
  id: string
  err_id: string | null
  display_name: string | null
  role: 'admin' | 'state_err' | 'base_err'
  createdAt: string
  status: 'pending' | 'active' | 'suspended'
}

export interface ActiveUserListItem {
  id: string
  err_id: string | null
  display_name: string | null
  role: 'admin' | 'state_err' | 'base_err'
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string | null
} 