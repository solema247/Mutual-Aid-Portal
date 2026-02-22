import type { SupabaseClient } from '@supabase/supabase-js'

export interface UserOverride {
  add: string[]
  remove: string[]
}

export async function getOverridesForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<UserOverride> {
  const { data } = await supabase
    .from('user_permission_overrides')
    .select('add_functions, remove_functions')
    .eq('user_id', userId)
    .single()
  if (!data) return { add: [], remove: [] }
  const parseList = (v: unknown): string[] => {
    if (Array.isArray(v)) return v
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }
  return {
    add: parseList(data.add_functions),
    remove: parseList(data.remove_functions)
  }
}

export async function getOverridesMap(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Record<string, UserOverride>> {
  if (userIds.length === 0) return {}
  const { data: rows } = await supabase
    .from('user_permission_overrides')
    .select('user_id, add_functions, remove_functions')
    .in('user_id', userIds)
  const map: Record<string, UserOverride> = {}
  for (const id of userIds) {
    map[id] = { add: [], remove: [] }
  }
  const parseList = (v: unknown): string[] => {
    if (Array.isArray(v)) return v
    if (typeof v === 'string') {
      try {
        const parsed = JSON.parse(v)
        return Array.isArray(parsed) ? parsed : []
      } catch {
        return []
      }
    }
    return []
  }
  if (rows) {
    for (const r of rows) {
      map[r.user_id] = {
        add: parseList(r.add_functions),
        remove: parseList(r.remove_functions)
      }
    }
  }
  return map
}

export async function saveOverrides(
  supabase: SupabaseClient,
  userId: string,
  add: string[],
  remove: string[]
): Promise<{ error: Error | null }> {
  const { error } = await supabase
    .from('user_permission_overrides')
    .upsert(
      {
        user_id: userId,
        add_functions: add,
        remove_functions: remove
      },
      { onConflict: 'user_id' }
    )
  return { error: error ?? null }
}
