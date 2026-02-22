import functionsList from '@/data/functions.json'
import rolePermissions from '@/data/rolePermissions.json'

export type Role = 'superadmin' | 'admin' | 'state_err' | 'base_err'
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
const roleDefaults = rolePermissions as Record<string, string[]>

function getBaseAllowedForRole(role: string): Set<string> {
  if (role === 'superadmin') return new Set(allCodes)
  const list = roleDefaults[role]
  if (role === 'admin' && (!list || list.length === 0)) return new Set(allCodes)
  return new Set(list || [])
}

export function getRoleBase(role: string): string[] {
  return Array.from(getBaseAllowedForRole(role))
}

export function getAllowedSetFromOverrides(
  user: PermissionUser,
  overridesMap: UserOverridesMap
): Set<string> {
  if (user.role === 'superadmin') return new Set(allCodes)
  const base = getBaseAllowedForRole(user.role)
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
  overridesMap: UserOverridesMap
): boolean {
  if (!user) return false
  return getAllowedSetFromOverrides(user, overridesMap).has(functionCode)
}

export function getFunctionList(): FunctionDefinition[] {
  return functionsList as FunctionDefinition[]
}

export function getAllowedFunctions(
  user: PermissionUser | null,
  overridesMap: UserOverridesMap
): string[] {
  if (!user) return []
  return Array.from(getAllowedSetFromOverrides(user, overridesMap))
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
