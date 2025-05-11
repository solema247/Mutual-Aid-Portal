import { supabase } from '@/lib/supabaseClient'
import { User } from '../types/users'

export async function getPendingUsers(): Promise<User[]> {
  const { data: users, error } = await supabase
    .from('users')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })

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
  sortOrder = 'desc'
}: GetActiveUsersParams): Promise<GetActiveUsersResult> {
  let query = supabase
    .from('users')
    .select('*', { count: 'exact' })
    .neq('status', 'pending')

  if (role) {
    query = query.eq('role', role)
  }

  if (status) {
    query = query.eq('status', status)
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