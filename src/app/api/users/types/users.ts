export interface User {
  id: string
  err_id: string | null
  display_name: string | null
  role: 'admin' | 'state_err' | 'base_err'
  status: 'pending' | 'active' | 'suspended'
  created_at: string
  updated_at: string | null
}

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