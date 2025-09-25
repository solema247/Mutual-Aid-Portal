import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const donor = searchParams.get('donor')
    const grant = searchParams.get('grant')
    const state = searchParams.get('state')

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


