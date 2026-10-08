import { getUserStateAccess } from '@/lib/userStateAccess'
import { getUserGrantAccess, type UserGrantAccess } from '@/lib/userGrantAccess'
import { getUserRoomAccess, type UserRoomAccess } from '@/lib/userRoomAccess'
import { getUserOrgScope } from '@/lib/canvas/orgScope'

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
  /** Canvas org id when session is org-bound; null when staging fallback */
  organizationId: string | null
  isEmpty: boolean
}

export async function resolveF4F5ListScope(): Promise<F4F5ListScope> {
  const [stateAccess, grantAccess, roomAccess, orgScope] = await Promise.all([
    getUserStateAccess(),
    getUserGrantAccess(),
    getUserRoomAccess(),
    getUserOrgScope(),
  ])

  const { allowedStateNames } = stateAccess
  const useStateScope = !(roomAccess.applies && roomAccess.mode === 'room')

  let emergencyRoomId: string | null = null
  if (roomAccess.applies && roomAccess.mode === 'room') {
    emergencyRoomId = roomAccess.emergencyRoomId
  }

  let grantGridIds: string[] | null = null
  if (grantAccess.mode === 'partner') {
    grantGridIds = grantAccess.grantGridIds
  }

  const organizationId = orgScope.mode === 'org' ? orgScope.organizationId : null

  let isEmpty = false
  if (orgScope.mode === 'none') {
    isEmpty = true
  } else if (grantAccess.mode === 'none') {
    isEmpty = true
  } else if (roomAccess.applies && roomAccess.mode === 'none') {
    isEmpty = true
  } else if (
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
    isEmpty,
  }
}
