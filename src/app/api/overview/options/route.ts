import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  applyGrantGridIdFilter,
  chunkGrantScopeIds,
  getUserGrantAccess,
} from '@/lib/userGrantAccess'

const EMPTY_OPTIONS = { donors: [], grants: [], states: [], rooms: [] }

const PROJECT_STATUSES = ['approved', 'active'] as const

type EmbeddedRoom = {
  id?: string
  name?: string | null
  name_ar?: string | null
  err_code?: string | null
}

type OptionsProject = {
  state?: string | null
  donor_id?: string | null
  grant_call_id?: string | null
  emergency_rooms?: EmbeddedRoom | null
}

function firstRoom(value: EmbeddedRoom | EmbeddedRoom[] | null | undefined): EmbeddedRoom | null {
  if (!value) return null
  return Array.isArray(value) ? value[0] ?? null : value
}

function emptyOptionsResponse() {
  return NextResponse.json(EMPTY_OPTIONS)
}

export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const grantAccess = await getUserGrantAccess()
    const { searchParams } = new URL(request.url)
    const donor = searchParams.get('donor')
    const grant = searchParams.get('grant')
    const state = searchParams.get('state')

    if (grantAccess.mode === 'none') {
      return emptyOptionsResponse()
    }

    if (grantAccess.mode === 'partner') {
      const projectSelect = 'state, donor_id, grant_call_id, emergency_rooms ( id, name, name_ar, err_code )'
      const projects: OptionsProject[] = []

      for (const batch of chunkGrantScopeIds(grantAccess.grantGridIds)) {
        let query = supabase
          .from('err_projects')
          .select(projectSelect)
          .eq('funding_status', 'committed')
          .in('status', PROJECT_STATUSES)
        query = applyGrantGridIdFilter(query, { ...grantAccess, grantGridIds: batch })
        if (donor) query = query.eq('donor_id', donor)
        if (grant) query = query.eq('grant_call_id', grant)
        const { data, error } = await query
        if (error) {
          console.error('overview/options partner projects error', error)
          return NextResponse.json({ error: 'Failed to load options' }, { status: 500 })
        }
        for (const row of data || []) {
          projects.push({
            state: row.state,
            donor_id: row.donor_id,
            grant_call_id: row.grant_call_id,
            emergency_rooms: firstRoom(row.emergency_rooms),
          })
        }
      }

      if (projects.length === 0) {
        return emptyOptionsResponse()
      }

      const donorIds = Array.from(
        new Set(projects.map((p) => p.donor_id).filter((id): id is string => Boolean(id)))
      )
      const grantCallIds = Array.from(
        new Set(projects.map((p) => p.grant_call_id).filter((id): id is string => Boolean(id)))
      )

      const donors: { id: string; name: string | null; short_name: string | null }[] = []
      for (const batch of chunkGrantScopeIds(donorIds)) {
        const { data, error } = await supabase
          .from('donors')
          .select('id, name, short_name')
          .in('id', batch)
          .order('name')
        if (error) {
          console.error('overview/options partner donors error', error)
          return NextResponse.json({ error: 'Failed to load options' }, { status: 500 })
        }
        if (data?.length) donors.push(...data)
      }
      donors.sort((a, b) => String(a.name ?? '').localeCompare(String(b.name ?? '')))

      const grants: { id: string; name: string | null; shortname: string | null; donor_id: string | null }[] = []
      for (const batch of chunkGrantScopeIds(grantCallIds)) {
        let gcq = supabase
          .from('grant_calls')
          .select('id, name, shortname, donor_id')
          .in('id', batch)
          .order('created_at', { ascending: false })
        if (donor) gcq = gcq.eq('donor_id', donor)
        const { data, error } = await gcq
        if (error) {
          console.error('overview/options partner grants error', error)
          return NextResponse.json({ error: 'Failed to load options' }, { status: 500 })
        }
        if (data?.length) grants.push(...data)
      }

      const states = Array.from(
        new Set(projects.map((p) => p.state).filter((value): value is string => Boolean(value)))
      )

      const roomMap = new Map<string, { id: string; name: string | null; name_ar: string | null; err_code: string | null }>()
      for (const row of projects) {
        if (state && row.state !== state) continue
        const room = row.emergency_rooms
        if (room?.id && !roomMap.has(room.id)) {
          roomMap.set(room.id, {
            id: room.id,
            name: room.name ?? null,
            name_ar: room.name_ar ?? null,
            err_code: room.err_code ?? null,
          })
        }
      }

      return NextResponse.json({
        donors,
        grants,
        states,
        rooms: Array.from(roomMap.values()),
      })
    }

    // Donors
    const { data: donors } = await supabase.from('donors').select('id, name, short_name').order('name')

    // Grant calls (optionally by donor)
    let gcq = supabase.from('grant_calls').select('id, name, shortname, donor_id').order('created_at', { ascending: false })
    if (donor) gcq = gcq.eq('donor_id', donor)
    const { data: grants } = await gcq

    // States (committed + approved/active only)
    let sp = supabase
      .from('err_projects')
      .select('state')
      .eq('funding_status', 'committed')
      .in('status', ['approved', 'active'])
      .not('state', 'is', null)
    if (grant) sp = sp.eq('grant_call_id', grant)
    const { data: statesRows } = await sp
    const states = Array.from(new Set((statesRows || []).map((r:any)=> r.state).filter(Boolean)))

    // ERRs (optionally by state & grant) - committed + approved/active only
    let rp = supabase
      .from('err_projects')
      .select('emergency_rooms ( id, name, name_ar, err_code ), state, grant_call_id')
      .eq('funding_status', 'committed')
      .in('status', ['approved', 'active'])
      .not('emergency_room_id', 'is', null)
    if (state) rp = rp.eq('state', state)
    if (grant) rp = rp.eq('grant_call_id', grant)
    const { data: roomRows } = await rp
    const roomMap = new Map<string, any>()
    for (const r of roomRows || []) {
      const room = (r as any).emergency_rooms
      if (room?.id && !roomMap.has(room.id)) roomMap.set(room.id, room)
    }
    const rooms = Array.from(roomMap.values()).map((r:any)=> ({ id: r.id, name: r.name, name_ar: r.name_ar, err_code: r.err_code }))

    return NextResponse.json({ donors: donors || [], grants: grants || [], states, rooms })
  } catch (e) {
    console.error('overview/options error', e)
    return NextResponse.json({ error: 'Failed to load options' }, { status: 500 })
  }
}
