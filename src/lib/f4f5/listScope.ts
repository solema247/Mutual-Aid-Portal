import { getUserStateAccess } from '@/lib/userStateAccess'
import { getUserGrantAccess, type UserGrantAccess } from '@/lib/userGrantAccess'
import { getUserRoomAccess, type UserRoomAccess } from '@/lib/userRoomAccess'
import {
  getUserOrgScope,
  orgIdsGrantedForType,
  orgScopeBlocksAllData,
  type UserOrgScope,
} from '@/lib/canvas/orgScope'
import type { InfoResourceType } from '@/lib/canvas/disclosure'

export type F4F5ListScope = {
  grantAccess: UserGrantAccess
  allowedStateNames: string[] | null
  roomAccess: UserRoomAccess
  /** Partner grant grid batches, or null for non-partner */
  grantGridIds: string[] | null
  /** Primary room filter for base_err */
  emergencyRoomId: string | null
  /** When false, skip state fail-closed and state IN filter (base_err room scope) */
  useStateScope: boolean
  /** Canvas org id when session is org-bound; null when staging fallback or disclosed */
  organizationId: string | null
  /** Full org scope (for disclosed coordinator filtering) */
  orgScope: UserOrgScope
  /** Org ids allowed for this resource type (processor own org, or granted orgs) */
  organizationIds: string[] | null
  isEmpty: boolean
}

export async function resolveF4F5ListScope(
  resourceType: InfoResourceType = 'f4'
): Promise<F4F5ListScope> {
  const [stateAccess, grantAccess, roomAccess, orgScope] = await Promise.all([
    getUserStateAccess(),
    getUserGrantAccess(),
    getUserRoomAccess(),
    getUserOrgScope(),
  ])

  const { allowedStateNames } = stateAccess
  const useStateScope =
    !(roomAccess.applies && roomAccess.mode === 'room') &&
    orgScope.mode !== 'disclosed'

  let emergencyRoomId: string | null = null
  if (roomAccess.applies && roomAccess.mode === 'room') {
    emergencyRoomId = roomAccess.emergencyRoomId
  }

  let grantGridIds: string[] | null = null
  if (grantAccess.mode === 'partner' && orgScope.mode !== 'disclosed') {
    grantGridIds = grantAccess.grantGridIds
  }

  const organizationId = orgScope.mode === 'org' ? orgScope.organizationId : null

  let organizationIds: string[] | null = null
  if (orgScope.mode === 'org') {
    organizationIds = [orgScope.organizationId]
  } else if (orgScope.mode === 'disclosed') {
    organizationIds = orgIdsGrantedForType(orgScope, resourceType)
  }

  let isEmpty = false
  if (orgScopeBlocksAllData(orgScope)) {
    isEmpty = true
  } else if (orgScope.mode === 'disclosed' && (organizationIds?.length ?? 0) === 0) {
    isEmpty = true
  } else if (orgScope.mode !== 'disclosed' && grantAccess.mode === 'none') {
    isEmpty = true
  } else if (roomAccess.applies && roomAccess.mode === 'none') {
    isEmpty = true
  } else if (
    orgScope.mode !== 'disclosed' &&
    grantAccess.mode !== 'partner' &&
    useStateScope &&
    allowedStateNames !== null &&
    allowedStateNames.length === 0
  ) {
    isEmpty = true
  }

  return {
    grantAccess,
    allowedStateNames,
    roomAccess,
    grantGridIds,
    emergencyRoomId,
    useStateScope,
    organizationId,
    orgScope,
    organizationIds,
    isEmpty,
  }
}
