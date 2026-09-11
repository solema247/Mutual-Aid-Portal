import { NextResponse } from 'next/server'
import {
  assertPermission,
  getRouteHandlerAuth,
  type RouteAuthContext,
} from '@/lib/routeHandlerAuth'
import { isStateManagementRole } from '@/lib/stateManagement/roles'

export { isStateManagementRole, STATE_MANAGEMENT_ROLES } from '@/lib/stateManagement/roles'

type StateManagerResult =
  | { ok: true; ctx: RouteAuthContext }
  | { ok: false; response: NextResponse }

export async function requireStateManager (functionCode: string): Promise<StateManagerResult> {
  const auth = await getRouteHandlerAuth()
  if (!auth) {
    return { ok: false, response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }

  if (!isStateManagementRole(auth.dbUser.role)) {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  try {
    assertPermission(auth, functionCode)
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }

  return { ok: true, ctx: auth }
}
