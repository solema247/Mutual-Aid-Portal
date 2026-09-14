import type { SupabaseClient } from '@supabase/supabase-js'
import rolePermissions from '@/data/rolePermissions.json'
import functionsList from '@/data/functions.json'

export type RoleDefaultsMap = Record<string, string[]>

/** Roles whose default packs can be edited in the UI. */
export const EDITABLE_ROLE_DEFAULTS = ['base_err', 'state_err', 'admin'] as const
export type EditableRoleDefault = (typeof EDITABLE_ROLE_DEFAULTS)[number]

export function isEditableRoleDefault(role: string): role is EditableRoleDefault {
  return (EDITABLE_ROLE_DEFAULTS as readonly string[]).includes(role)
}

const jsonDefaults = rolePermissions as Record<string, string[]>
const allFunctionCodes = (functionsList as { code: string }[]).map((f) => f.code)

function parseCodes(v: unknown): string[] {
  if (Array.isArray(v)) return v.filter((c): c is string => typeof c === 'string')
  if (typeof v === 'string') {
    try {
      const parsed = JSON.parse(v)
      return Array.isArray(parsed) ? parsed.filter((c): c is string => typeof c === 'string') : []
    } catch {
      return []
    }
  }
  return []
}

function seedCodesForRole(role: string): string[] {
  const fromJson = jsonDefaults[role]
  if (fromJson && fromJson.length > 0) return [...fromJson]
  // admin historically used [] to mean "all"
  if (role === 'admin') return [...allFunctionCodes]
  return fromJson ? [...fromJson] : []
}

/** JSON seed/fallback when DB has no row for a role. */
export function getJsonRoleDefaults(): RoleDefaultsMap {
  const map: RoleDefaultsMap = { ...jsonDefaults }
  if (!map.admin?.length) {
    map.admin = [...allFunctionCodes]
  }
  return map
}

/**
 * Load role default packs from DB. Returns null if the table is missing / query fails
 * so callers can fall back to JSON.
 */
export async function getRoleDefaultsMap(
  supabase: SupabaseClient
): Promise<RoleDefaultsMap | null> {
  const { data, error } = await supabase
    .from('role_permission_defaults')
    .select('role, function_codes')

  if (error) {
    console.warn('role_permission_defaults read failed (using JSON fallback):', error.message)
    return null
  }

  const map: RoleDefaultsMap = {}
  for (const row of data ?? []) {
    if (row?.role) map[row.role] = parseCodes(row.function_codes)
  }
  return map
}

/** Ensure editable role rows exist (seed from JSON / all-codes for admin). No-op if table missing. */
export async function ensureRoleDefaultsSeeded(
  supabase: SupabaseClient
): Promise<RoleDefaultsMap> {
  const existing = await getRoleDefaultsMap(supabase)
  if (existing === null) return getJsonRoleDefaults()

  const missing = EDITABLE_ROLE_DEFAULTS.filter((role) => !(role in existing))
  if (missing.length === 0) {
    return { ...getJsonRoleDefaults(), ...existing }
  }

  const rows = missing.map((role) => ({
    role,
    function_codes: seedCodesForRole(role),
    updated_at: new Date().toISOString(),
  }))

  const { error } = await supabase.from('role_permission_defaults').upsert(rows, {
    onConflict: 'role',
  })
  if (error) {
    console.warn('role_permission_defaults seed failed:', error.message)
    return { ...getJsonRoleDefaults(), ...existing }
  }

  const refreshed = await getRoleDefaultsMap(supabase)
  return { ...getJsonRoleDefaults(), ...(refreshed ?? existing) }
}

export async function saveRoleDefaults(
  supabase: SupabaseClient,
  role: EditableRoleDefault,
  functionCodes: string[],
  updatedBy?: string | null
): Promise<{ error: Error | null }> {
  const { error } = await supabase.from('role_permission_defaults').upsert(
    {
      role,
      function_codes: functionCodes,
      updated_at: new Date().toISOString(),
      updated_by: updatedBy ?? null,
    },
    { onConflict: 'role' }
  )
  return { error: error ? new Error(error.message) : null }
}

/** Merge role defaults for permission checks: DB rows override JSON for that role. */
export function mergeRoleDefaultsMaps(
  jsonFallback: RoleDefaultsMap,
  dbMap: RoleDefaultsMap | null
): RoleDefaultsMap {
  if (!dbMap) return jsonFallback
  return { ...jsonFallback, ...dbMap }
}
