import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  applyGrantGridIdFilter,
  chunkGrantScopeIds,
  getUserGrantAccess,
  type UserGrantAccess,
} from '@/lib/userGrantAccess'
import { getUserRoomAccess } from '@/lib/userRoomAccess'
import {
  applyOrganizationIdFilter,
  getUserOrgScope,
  orgScopeBlocksAllData,
  type UserOrgScope,
} from '@/lib/canvas/orgScope'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

const NO_STORE = { 'Cache-Control': 'no-store, no-cache, must-revalidate' }

/** Same filter the F1 submissions screen used in the browser. */
const SOURCE_FILTER = 'source.is.null,source.neq.mutual_aid_portal'

type ScopedAccess = Extract<UserGrantAccess, { mode: 'partner' }>

async function fetchProjectsInGrantScope(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  grantAccess: ScopedAccess,
  orgScope: UserOrgScope
) {
  const projects: { id: string; submitted_at?: string | null }[] = []
  for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
    let from = 0
    const pageSize = 1000
    while (true) {
      let query = supabase
        .from('err_projects')
        .select('*')
        .or(SOURCE_FILTER)
      query = applyOrganizationIdFilter(query, orgScope)
      query = applyGrantGridIdFilter(query, { ...grantAccess, grantGridIds: batch })
      const { data, error } = await query
        .order('submitted_at', { ascending: false })
        .range(from, from + pageSize - 1)
      if (error) throw error
      if (!data?.length) break
      projects.push(...data)
      if (data.length < pageSize) break
      from += pageSize
    }
  }
  projects.sort((a, b) => String(b.submitted_at ?? '').localeCompare(String(a.submitted_at ?? '')))
  return projects
}

/** Base ERR: ERR App submissions for the user's emergency room only. */
async function fetchProjectsInRoomScope(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  emergencyRoomId: string,
  orgScope: UserOrgScope
) {
  const projects: { id: string; submitted_at?: string | null }[] = []
  let from = 0
  const pageSize = 1000
  while (true) {
    let query = supabase
      .from('err_projects')
      .select('*')
      .or(SOURCE_FILTER)
      .eq('emergency_room_id', emergencyRoomId)
    query = applyOrganizationIdFilter(query, orgScope)
    const { data, error } = await query
      .order('submitted_at', { ascending: false })
      .range(from, from + pageSize - 1)
    if (error) throw error
    if (!data?.length) break
    projects.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return projects
}

async function projectInRoomScope(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  emergencyRoomId: string,
  projectId: string
) {
  const { data, error } = await supabase
    .from('err_projects')
    .select('id')
    .eq('id', projectId)
    .eq('emergency_room_id', emergencyRoomId)
    .limit(1)
  if (error) throw error
  return Boolean(data?.length)
}

async function projectInPartnerScope(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  grantAccess: ScopedAccess,
  projectId: string
) {
  for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
    let query = supabase
      .from('err_projects')
      .select('id')
      .eq('id', projectId)
      .or(SOURCE_FILTER)
    query = applyGrantGridIdFilter(query, { ...grantAccess, grantGridIds: batch })
    const { data, error } = await query.limit(1)
    if (error) throw error
    if (data?.length) return true
  }
  return false
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const [grantAccess, roomAccess, orgScope] = await Promise.all([
      getUserGrantAccess(),
      getUserRoomAccess(),
      getUserOrgScope(),
    ])
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')?.trim() || ''
    const fundingCycleId = searchParams.get('funding_cycle_id')?.trim() || ''

    if (orgScopeBlocksAllData(orgScope)) {
      return NextResponse.json([], { headers: NO_STORE })
    }

    if (projectId) {
      if (roomAccess.mode === 'none') {
        return NextResponse.json({ feedback: [] }, { headers: NO_STORE })
      }
      if (roomAccess.mode === 'room') {
        const allowed = await projectInRoomScope(supabase, roomAccess.emergencyRoomId, projectId)
        if (!allowed) {
          return NextResponse.json({ feedback: [] }, { headers: NO_STORE })
        }
      } else if (grantAccess.mode === 'none') {
        return NextResponse.json({ feedback: [] }, { headers: NO_STORE })
      } else if (grantAccess.mode === 'partner') {
        const allowed = await projectInPartnerScope(supabase, grantAccess, projectId)
        if (!allowed) {
          return NextResponse.json({ feedback: [] }, { headers: NO_STORE })
        }
      }
      const { data, error } = await supabase
        .from('project_feedback')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })
      if (error) throw error
      return NextResponse.json({ feedback: data || [] }, { headers: NO_STORE })
    }

    if (fundingCycleId) {
      if (grantAccess.mode !== 'all') {
        return NextResponse.json({ grant_serials: [] }, { headers: NO_STORE })
      }
      const { data, error } = await supabase
        .from('grant_serials')
        .select('grant_serial, funding_cycle_id, state_name, yymm')
        .eq('funding_cycle_id', fundingCycleId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return NextResponse.json({ grant_serials: data || [] }, { headers: NO_STORE })
    }

    if (roomAccess.mode === 'none') {
      return NextResponse.json([], { headers: NO_STORE })
    }

    if (roomAccess.mode === 'room') {
      const projects = await fetchProjectsInRoomScope(
        supabase,
        roomAccess.emergencyRoomId,
        orgScope
      )
      return NextResponse.json({ projects }, { headers: NO_STORE })
    }

    if (grantAccess.mode === 'none') {
      return NextResponse.json([], { headers: NO_STORE })
    }

    if (grantAccess.mode === 'partner') {
      const projects = await fetchProjectsInGrantScope(supabase, grantAccess, orgScope)
      return NextResponse.json({ projects }, { headers: NO_STORE })
    }

    let allQuery = supabase
      .from('err_projects')
      .select('*')
      .or(SOURCE_FILTER)
    allQuery = applyOrganizationIdFilter(allQuery, orgScope)
    const { data, error } = await allQuery.order('submitted_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ projects: data || [] }, { headers: NO_STORE })
  } catch (e) {
    console.error('GET /api/f1/err/submissions:', e)
    return NextResponse.json({ error: 'Failed to load F1 submissions' }, { status: 500, headers: NO_STORE })
  }
}
