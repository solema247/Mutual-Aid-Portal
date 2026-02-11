/**
 * Central permissions: role defaults + user overrides.
 * superadmin has all permissions from code (not from JSON).
 * On the server, overrides are read from disk on each check so saved changes take effect immediately.
 */

import functionsList from '@/data/functions.json'
import rolePermissions from '@/data/rolePermissions.json'
import userOverridesStatic from '@/data/userOverrides.json'

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
}

export interface UserOverride {
  add?: string[]
  remove?: string[]
}

export type UserOverridesMap = Record<string, UserOverride>

const allCodes = (functionsList as FunctionDefinition[]).map((f) => f.code)

type RolePermissionsMap = Record<string, string[]>

const roleDefaults = rolePermissions as RolePermissionsMap
const staticOverrides = userOverridesStatic as UserOverridesMap

/** Read user overrides from disk on server so saved changes apply without restart. */
function getOverrides(): UserOverridesMap {
  if (typeof window !== 'undefined') {
    return staticOverrides
  }
  try {
    const fs = require('fs') as typeof import('fs')
    const path = require('path') as typeof import('path')
    const p = path.join(process.cwd(), 'src', 'data', 'userOverrides.json')
    const raw = fs.readFileSync(p, 'utf-8')
    return JSON.parse(raw) as UserOverridesMap
  } catch {
    return staticOverrides
  }
}

/**
 * Get the set of function codes allowed for a role (before user overrides).
 * admin with empty array in JSON means "all functions".
 */
function getBaseAllowedForRole(role: string): Set<string> {
  if (role === 'superadmin') {
    return new Set(allCodes)
  }
  const list = roleDefaults[role]
  if (role === 'admin' && (!list || list.length === 0)) {
    return new Set(allCodes)
  }
  return new Set(list || [])
}

/** Get role default permission codes (for permission management UI). */
export function getRoleBase(role: string): string[] {
  return Array.from(getBaseAllowedForRole(role))
}

/**
 * Compute allowed set from role base + optional overrides map (for API use with fresh file data).
 */
export function getAllowedSetFromOverrides(
  user: PermissionUser,
  overridesMap: UserOverridesMap
): Set<string> {
  if (user.role === 'superadmin') {
    return new Set(allCodes)
  }
  const base = getBaseAllowedForRole(user.role)
  const override = overridesMap[user.id]
  if (!override) {
    return base
  }
  const result = new Set(base)
  if (override.remove?.length) {
    override.remove.forEach((code) => result.delete(code))
  }
  if (override.add?.length) {
    override.add.forEach((code) => result.add(code))
  }
  return result
}

/**
 * Compute final set of allowed function codes for a user (role defaults + user overrides).
 * Uses fresh overrides from disk on server so permission changes take effect immediately.
 */
function getAllowedSet(user: PermissionUser): Set<string> {
  return getAllowedSetFromOverrides(user, getOverrides())
}

/**
 * Check if the user is allowed to perform the given function.
 * Use this in API routes and (via passed data) in UI to guard actions.
 */
export function can(user: PermissionUser | null, functionCode: string): boolean {
  if (!user) return false
  const allowed = getAllowedSet(user)
  return allowed.has(functionCode)
}

/**
 * Get the list of all function definitions (for permission management UI).
 */
export function getFunctionList(): FunctionDefinition[] {
  return functionsList as FunctionDefinition[]
}

/**
 * Get the list of function codes the user is allowed to perform.
 */
export function getAllowedFunctions(user: PermissionUser | null): string[] {
  if (!user) return []
  return Array.from(getAllowedSet(user))
}

/**
 * Get functions grouped by module (for display in permission UI).
 */
export function getFunctionsByModule(): Record<string, FunctionDefinition[]> {
  const list = getFunctionList()
  const byModule: Record<string, FunctionDefinition[]> = {}
  for (const f of list) {
    if (!byModule[f.module]) byModule[f.module] = []
    byModule[f.module].push(f)
  }
  return byModule
}
