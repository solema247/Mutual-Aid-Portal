import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

/**
 * Get the list of state names that a user is allowed to see
 * @param canSeeAllStates - Whether user can see all states
 * @param visibleStateIds - Array of state IDs the user can see
 * @returns Array of state names, or null if user can see all states
 */
export async function getAllowedStateNames(
  canSeeAllStates: boolean,
  visibleStateIds: string[]
): Promise<string[] | null> {
  // If user can see all states, return null (no filtering needed)
  if (canSeeAllStates) {
    return null
  }

  // If no visible states specified, return empty array (no access)
  if (!visibleStateIds || visibleStateIds.length === 0) {
    return []
  }

  // Map state IDs to state names
  const supabase = getSupabaseRouteClient()
  const { data: states, error } = await supabase
    .from('states')
    .select('state_name')
    .in('id', visibleStateIds)

  if (error) {
    console.error('Error fetching state names:', error)
    return []
  }

  return (states || []).map((s: any) => s.state_name).filter(Boolean)
}

/**
 * Get current user's state access information from session
 * @returns Object with canSeeAllStates and allowedStateNames
 */
export async function getUserStateAccess(): Promise<{
  canSeeAllStates: boolean
  allowedStateNames: string[] | null
}> {
  const supabase = getSupabaseRouteClient()
  
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  if (sessionError || !session) {
    return { canSeeAllStates: false, allowedStateNames: [] }
  }

  const { data: userData, error } = await supabase
    .from('users')
    .select('can_see_all_states, visible_states')
    .eq('auth_user_id', session.user.id)
    .single()

  if (error || !userData) {
    return { canSeeAllStates: false, allowedStateNames: [] }
  }

  const canSeeAllStates = userData.can_see_all_states ?? true
  let visibleStateIds = userData.visible_states || []
  
  // Parse if it's a string (JSON)
  if (typeof visibleStateIds === 'string') {
    try {
      visibleStateIds = JSON.parse(visibleStateIds)
    } catch (e) {
      visibleStateIds = []
    }
  }

  const allowedStateNames = await getAllowedStateNames(canSeeAllStates, visibleStateIds)

  return {
    canSeeAllStates,
    allowedStateNames
  }
}

