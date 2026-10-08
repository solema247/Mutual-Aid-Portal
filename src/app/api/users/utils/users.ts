import { supabase } from '@/lib/supabaseClient'
import { User } from '../types/users'
import type { SupabaseClient } from '@supabase/supabase-js'

function escapeIlike(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
}

interface StateResponse {
  state: {
    state_name: string;
  }[];
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
  /** @deprecated Prefer `roles` for multi-select. Kept for ActiveUsersList. */
  role?: 'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err' | 'partner'
  roles?: Array<'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err' | 'partner'>
  /** 'all' = every non-pending/non-deleted status; default remains 'active' for existing callers */
  status?: 'active' | 'suspended' | 'all'
  statuses?: Array<'active' | 'suspended'>
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
  currentUserRole: string
  currentUserErrId: string | null
  /** @deprecated Prefer `stateFilters` for multi-select */
  stateFilter?: string | null
  /** State names and/or 'no_state' */
  stateFilters?: string[]
  /** Display name search (ilike). Applied before pagination. */
  search?: string | null
  /**
   * Auth user IDs whose email matched the search (resolved server-side).
   * Combined with display_name search via OR when both are present.
   */
  emailMatchedAuthIds?: string[]
  /** Scope keys: all_states | state | emergency_room | partner_grant */
  scopes?: string[]
  errIds?: string[]
  partnerIds?: string[]
  /** When set, only return these user ids (org membership scope). */
  userIds?: string[]
  /** Optional Supabase client (route/server). Defaults to browser client. */
  client?: SupabaseClient
}

interface GetActiveUsersResult {
  users: User[]
  total: number
}

const EMPTY_UUID = '00000000-0000-0000-0000-000000000000'

function applyScopeFilter<T extends { or: (filters: string) => T }>(
  query: T,
  scopes: string[]
): T {
  if (scopes.length === 0) return query

  const clauses: string[] = []
  if (scopes.includes('partner_grant')) {
    clauses.push('role.eq.partner')
  }
  if (scopes.includes('emergency_room')) {
    clauses.push('role.eq.base_err')
  }
  if (scopes.includes('state')) {
    // State-scoped users: state_err role, or limited state access on other roles
    clauses.push('role.eq.state_err')
    clauses.push('and(can_see_all_states.eq.false,role.not.in.(partner,base_err,state_err))')
  }
  if (scopes.includes('all_states')) {
    clauses.push(
      'and(can_see_all_states.eq.true,role.not.in.(partner,base_err))'
    )
  }

  if (clauses.length === 0) return query
  if (clauses.length === 1) return query.or(clauses[0])
  return query.or(clauses.join(','))
}

export async function getActiveUsers({
  page = 1,
  pageSize = 20,
  role,
  roles,
  status = 'active',
  statuses,
  sortBy = 'created_at',
  sortOrder = 'desc',
  currentUserRole,
  currentUserErrId,
  stateFilter,
  stateFilters,
  search,
  emailMatchedAuthIds,
  scopes,
  errIds,
  partnerIds,
  userIds,
  client,
}: GetActiveUsersParams): Promise<GetActiveUsersResult> {
  const db = client ?? supabase
  if (userIds && userIds.length === 0) {
    return { users: [], total: 0 }
  }
  let query = db
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
    .neq('status', 'deleted')

  const roleList =
    roles && roles.length > 0
      ? roles
      : role
        ? [role]
        : []
  if (roleList.length === 1) {
    query = query.eq('role', roleList[0])
  } else if (roleList.length > 1) {
    query = query.in('role', roleList)
  }

  const statusList =
    statuses && statuses.length > 0
      ? statuses
      : status && status !== 'all'
        ? [status]
        : []
  if (statusList.length === 1) {
    query = query.eq('status', statusList[0])
  } else if (statusList.length > 1) {
    query = query.in('status', statusList)
  }

  if (userIds && userIds.length > 0) {
    query = query.in('id', userIds)
  }

  const searchTerm = search?.trim()
  const emailIds = (emailMatchedAuthIds || []).filter(Boolean)
  if (searchTerm && emailIds.length > 0) {
    // Match display_name OR auth users whose email matched (server-resolved)
    const escaped = escapeIlike(searchTerm)
    query = query.or(
      `display_name.ilike.%${escaped}%,auth_user_id.in.(${emailIds.join(',')})`
    )
  } else if (searchTerm) {
    // users table has no email column; search display_name across the full dataset
    query = query.ilike('display_name', `%${escapeIlike(searchTerm)}%`)
  } else if (emailIds.length > 0) {
    query = query.in('auth_user_id', emailIds)
  }

  if (scopes && scopes.length > 0) {
    query = applyScopeFilter(query, scopes)
  }

  if (errIds && errIds.length > 0) {
    query = query.in('err_id', errIds)
  }

  if (partnerIds && partnerIds.length > 0) {
    query = query.in('ops_partner_id', partnerIds)
  }

  const stateList =
    stateFilters && stateFilters.length > 0
      ? stateFilters
      : stateFilter && stateFilter !== 'all'
        ? [stateFilter]
        : []

  if (stateList.length > 0) {
    const includeNoState = stateList.includes('no_state')
    const stateNames = stateList.filter((s) => s !== 'no_state')
    let errIdsFromStates: string[] = []

    if (stateNames.length > 0) {
      const { data: stateRefs } = await db
        .from('states')
        .select('id')
        .in('state_name', stateNames)

      if (stateRefs && stateRefs.length > 0) {
        const stateIds = stateRefs.map((ref) => ref.id)
        const { data: errsInState } = await db
          .from('emergency_rooms')
          .select('id')
          .in('state_reference', stateIds)

        errIdsFromStates = (errsInState || []).map((err) => err.id)
      }
    }

    if (includeNoState && errIdsFromStates.length > 0) {
      query = query.or(`err_id.is.null,err_id.in.(${errIdsFromStates.join(',')})`)
    } else if (includeNoState) {
      query = query.is('err_id', null)
    } else if (errIdsFromStates.length > 0) {
      query = query.in('err_id', errIdsFromStates)
    } else {
      query = query.eq('id', EMPTY_UUID)
    }
  }

  // Filter based on caller role visibility
  if (currentUserRole === 'state_err' && currentUserErrId) {
    const { data: currentERR } = await db
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
      const { data: stateRefs } = await db
        .from('states')
        .select('id')
        .eq('state_name', stateName)

      if (stateRefs && stateRefs.length > 0) {
        const stateIds = stateRefs.map(ref => ref.id)
        const { data: errsInState } = await db
          .from('emergency_rooms')
          .select('id')
          .in('state_reference', stateIds)

        if (errsInState && errsInState.length > 0) {
          const callerErrIds = errsInState.map(err => err.id)
          query = query.in('err_id', callerErrIds)
        } else {
          query = query.eq('id', EMPTY_UUID)
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

export async function approveUser(userId: string, currentUserRole?: string): Promise<void> {
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (targetError) {
    console.error('Error fetching target user:', targetError)
    throw targetError
  }

  if (targetUser?.role === 'superadmin' && currentUserRole !== 'superadmin' && currentUserRole !== 'support') {
    throw new Error('Only superadmin or support can approve superadmin users')
  }

  const { error } = await supabase
    .from('users')
    .update({ status: 'active' })
    .eq('id', userId)

  if (error) {
    console.error('Error approving user:', error)
    throw error
  }
}

export async function declineUser(userId: string, currentUserRole?: string): Promise<void> {
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (targetError) {
    console.error('Error fetching target user:', targetError)
    throw targetError
  }

  if (targetUser?.role === 'superadmin' && currentUserRole !== 'superadmin' && currentUserRole !== 'support') {
    throw new Error('Only superadmin or support can decline superadmin users')
  }

  const { error } = await supabase
    .from('users')
    .delete()
    .eq('id', userId)

  if (error) {
    console.error('Error declining user:', error)
    throw error
  }
}

export async function suspendUser(userId: string, currentUserRole?: string): Promise<void> {
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (targetError) {
    console.error('Error fetching target user:', targetError)
    throw targetError
  }

  if (targetUser?.role === 'superadmin' && currentUserRole !== 'support') {
    throw new Error('Only support can suspend superadmin users')
  }
  if (targetUser?.role === 'admin' && currentUserRole !== 'superadmin' && currentUserRole !== 'support') {
    throw new Error('Only superadmin or support can suspend admin users')
  }

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

export async function activateUser(userId: string, currentUserRole?: string): Promise<void> {
  const { data: targetUser, error: targetError } = await supabase
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (targetError) {
    console.error('Error fetching target user:', targetError)
    throw targetError
  }

  if (targetUser?.role === 'superadmin' && currentUserRole !== 'support') {
    throw new Error('Only support can activate superadmin users')
  }
  if (targetUser?.role === 'admin' && currentUserRole !== 'superadmin' && currentUserRole !== 'support') {
    throw new Error('Only superadmin or support can activate admin users')
  }

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