import functionsList from '@/data/functions.json'
import rolePermissions from '@/data/rolePermissions.json'
import type { RoleDefaultsMap } from '@/lib/roleDefaultsDb'

export type Role = 'support' | 'superadmin' | 'admin' | 'state_err' | 'base_err'
export interface PermissionUser {
  id: string
  role: Role
}
export interface FunctionDefinition {
  code: string
  module: string
  label_ar: string
  label_en: string
  description_en?: string
}
export interface UserOverride {
  add?: string[]
  remove?: string[]
}
export type UserOverridesMap = Record<string, UserOverride>

const allCodes = (functionsList as FunctionDefinition[]).map((f) => f.code)
const jsonRoleDefaults = rolePermissions as Record<string, string[]>

function getBaseAllowedForRole(
  role: string,
  roleDefaultsMap?: RoleDefaultsMap | null
): Set<string> {
  if (role === 'support' || role === 'superadmin') return new Set(allCodes)
  const hasExplicit =
    roleDefaultsMap != null && Object.prototype.hasOwnProperty.call(roleDefaultsMap, role)
  const list = hasExplicit ? roleDefaultsMap![role] : jsonRoleDefaults[role]
  // Legacy JSON convention: admin [] means all — only when no explicit map entry
  if (role === 'admin' && !hasExplicit && (!list || list.length === 0)) {
    return new Set(allCodes)
  }
  return new Set(list || [])
}

export function getRoleBase(
  role: string,
  roleDefaultsMap?: RoleDefaultsMap | null
): string[] {
  return Array.from(getBaseAllowedForRole(role, roleDefaultsMap))
}

export function getAllowedSetFromOverrides(
  user: PermissionUser,
  overridesMap: UserOverridesMap,
  roleDefaultsMap?: RoleDefaultsMap | null
): Set<string> {
  if (user.role === 'support' || user.role === 'superadmin') return new Set(allCodes)
  const base = getBaseAllowedForRole(user.role, roleDefaultsMap)
  const override = overridesMap[user.id]
  if (!override) return base
  const result = new Set(base)
  if (override.remove?.length) override.remove.forEach((c) => result.delete(c))
  if (override.add?.length) override.add.forEach((c) => result.add(c))
  return result
}

export function can(
  user: PermissionUser | null,
  functionCode: string,
  overridesMap: UserOverridesMap,
  roleDefaultsMap?: RoleDefaultsMap | null
): boolean {
  if (!user) return false
  return getAllowedSetFromOverrides(user, overridesMap, roleDefaultsMap).has(functionCode)
}

export function getFunctionList(): FunctionDefinition[] {
  return functionsList as FunctionDefinition[]
}

export function getAllowedFunctions(
  user: PermissionUser | null,
  overridesMap: UserOverridesMap,
  roleDefaultsMap?: RoleDefaultsMap | null
): string[] {
  if (!user) return []
  return Array.from(getAllowedSetFromOverrides(user, overridesMap, roleDefaultsMap))
}

export function getFunctionsByModule(): Record<string, FunctionDefinition[]> {
  const list = getFunctionList()
  const byModule: Record<string, FunctionDefinition[]> = {}
  for (const f of list) {
    if (!byModule[f.module]) byModule[f.module] = []
    byModule[f.module].push(f)
  }
  return byModule
}

export function hasExceptionOverrides(override: UserOverride | undefined | null): boolean {
  return Boolean(override?.add?.length || override?.remove?.length)
}
