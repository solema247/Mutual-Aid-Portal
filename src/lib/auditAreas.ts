/**
 * Audit Log business areas — shared action/target mapping (client + server).
 * project.* actions are only included in `all` (not attributed to F4/F5).
 */

import { KNOWN_AUDIT_ACTIONS } from '@/lib/auditActionLabels'
import { AUDIT_TARGET_TYPE_VALUES } from '@/lib/auditTargetTypeLabels'

export const AUDIT_AREA_IDS = [
  'all',
  'f1',
  'f2',
  'mou',
  'payment',
  'f4',
  'f5',
  'user_management',
  'permissions',
] as const

export type AuditArea = (typeof AUDIT_AREA_IDS)[number]

/** Areas that can be opened as workspace tabs (excluding default all-activity). */
export const AUDIT_AREA_TAB_IDS = [
  'f1',
  'f2',
  'mou',
  'payment',
  'f4',
  'f5',
  'user_management',
  'permissions',
] as const

export type AuditAreaTab = (typeof AUDIT_AREA_TAB_IDS)[number]

export const ALL_ACTIVITY_WORKSPACE_ID = 'all-activity'

const MOU_ACTIONS = [
  'f3.mou_created',
  'f3.mou_updated',
  'f3.mou_assigned',
  'f3.mou_reassigned',
  'f3.mou_projects_added',
  'f3.mou_projects_removed',
  'f3.mou_regenerated',
  'f3.signed_mou_uploaded',
] as const

const PAYMENT_ACTIONS = [
  'f3.payment_confirmation_created',
  'f3.payment_confirmation_updated',
  'f3.payment_confirmation_deleted',
  'f3.payment_file_added',
  'f3.payment_file_removed',
] as const

const USER_MANAGEMENT_ACTIONS = [
  'user.created',
  'user.updated',
  'user.role_changed',
  'user.status_changed',
  'user.deleted',
  'user.scope_changed',
] as const

const PERMISSIONS_ACTIONS = [
  'user.permission_changed',
  'user.permissions_reset',
] as const

/** Target types commonly used by actions in each area (for filter restriction). */
const AREA_TARGET_TYPES: Record<AuditArea, readonly string[]> = {
  all: AUDIT_TARGET_TYPE_VALUES,
  f1: ['project', 'project_document'],
  f2: ['project'],
  mou: ['mou'],
  payment: ['payment_confirmation', 'payment_file', 'mou'],
  f4: ['f4_summary', 'project'],
  f5: ['f5_report', 'project'],
  user_management: ['user'],
  permissions: ['user', 'role'],
}

export function isAuditArea(value: string | null | undefined): value is AuditArea {
  return (
    typeof value === 'string' &&
    (AUDIT_AREA_IDS as readonly string[]).includes(value)
  )
}

export function isAuditAreaTab(value: string): value is AuditAreaTab {
  return (AUDIT_AREA_TAB_IDS as readonly string[]).includes(value)
}

export function workspaceIdForArea(area: AuditArea): string {
  if (area === 'all') return ALL_ACTIVITY_WORKSPACE_ID
  return `area-${area}`
}

export function areaFromWorkspaceId(id: string): AuditArea {
  if (id === ALL_ACTIVITY_WORKSPACE_ID) return 'all'
  if (id.startsWith('area-')) {
    const a = id.slice(5)
    if (isAuditArea(a)) return a
  }
  return 'all'
}

export function getActionsForAuditArea(area: AuditArea): readonly string[] {
  if (area === 'all') return KNOWN_AUDIT_ACTIONS
  if (area === 'f1') return KNOWN_AUDIT_ACTIONS.filter((a) => a.startsWith('f1.'))
  if (area === 'f2') return KNOWN_AUDIT_ACTIONS.filter((a) => a.startsWith('f2.'))
  if (area === 'f4') return KNOWN_AUDIT_ACTIONS.filter((a) => a.startsWith('f4.'))
  if (area === 'f5') return KNOWN_AUDIT_ACTIONS.filter((a) => a.startsWith('f5.'))
  if (area === 'mou') return [...MOU_ACTIONS]
  if (area === 'payment') return [...PAYMENT_ACTIONS]
  if (area === 'user_management') return [...USER_MANAGEMENT_ACTIONS]
  if (area === 'permissions') return [...PERMISSIONS_ACTIONS]
  return KNOWN_AUDIT_ACTIONS
}

export function getTargetTypesForAuditArea(area: AuditArea): readonly string[] {
  return AREA_TARGET_TYPES[area]
}

/** Intersect user-selected actions with area allowlist; empty user selection → full area list. */
export function resolveEffectiveAuditActions(
  area: AuditArea,
  selectedActions: string[]
): string[] {
  const areaActions = [...getActionsForAuditArea(area)]
  const areaSet = new Set(areaActions)
  if (selectedActions.length === 0) return areaActions
  return selectedActions.filter((a) => areaSet.has(a))
}

export function filterActionsToArea(area: AuditArea, actionValues: string[]): string[] {
  const allowed = new Set(getActionsForAuditArea(area))
  return actionValues.filter((a) => allowed.has(a))
}

export function filterTargetTypesToArea(area: AuditArea, targetTypes: string[]): string[] {
  const allowed = new Set(getTargetTypesForAuditArea(area))
  return targetTypes.filter((t) => allowed.has(t))
}

export function auditAreaI18nKey(area: AuditArea): string {
  return `audit:area_${area}`
}
