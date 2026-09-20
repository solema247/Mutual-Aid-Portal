export interface User {
  id: string
  err_id: string | null
  partner_id?: string | null
  display_name: string | null
  role: 'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err' | 'partner'
  status: 'pending' | 'active' | 'suspended'
  created_at: string
  updated_at: string | null
  can_see_all_states?: boolean
  visible_states?: string[]
  emergency_rooms?: {
    name: string
    name_ar: string | null
    err_code: string | null
    state: {
      state_name: string
    }
  }
}

export interface PendingUserListItem {
  id: string
  err_id: string | null
  partner_id?: string | null
  display_name: string | null
  role: 'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err' | 'partner'
  createdAt: string
  status: 'pending' | 'active' | 'suspended'
  err_name?: string
  err_code?: string
  state_name?: string
}

export interface ActiveUserListItem {
  id: string
  err_id: string | null
  partner_id?: string | null
  display_name: string | null
  role: 'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err' | 'partner'
  status: 'active' | 'suspended'
  createdAt: string
  updatedAt: string | null
  err_name?: string
  err_code?: string
  state_name?: string
  can_see_all_states?: boolean
  visible_states?: string[]
} 