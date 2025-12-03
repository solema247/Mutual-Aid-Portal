import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/f2/committed - Get all committed F1s with optional filtering
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')
    const grantCall = searchParams.get('grant_call')
    const donor = searchParams.get('donor')
    const cycle = searchParams.get('cycle')
    const state = searchParams.get('state')

    let query = supabase
      .from('err_projects')
      .select(`
        id,
        err_id,
        date,
        state,
        locality,
        status,
        funding_status,
        expenses,
        grant_call_id,
        grant_calls (id, name, donors (name)),
        emergency_room_id,
        emergency_rooms (err_code, name_ar, name),
        submitted_at,
        funding_cycle_id,
        funding_cycles (id, name, year),
        mou_id,
        file_key,
        temp_file_key,
        grant_id,
        grant_serial_id,
        workplan_number
      `)
      .eq('funding_status', 'committed')
      .order('submitted_at', { ascending: false })

    // Apply filters
    if (grantCall) {
      query = query.eq('grant_call_id', grantCall)
    }
    if (cycle) {
      query = query.eq('funding_cycle_id', cycle)
    }
    if (state) {
      query = query.eq('state', state)
    }

    const { data, error } = await query

    if (error) throw error

    let formattedF1s = (data || []).map((f1: any) => ({
      id: f1.id,
      err_id: f1.err_id,
      date: f1.date,
      state: f1.state,
      locality: f1.locality,
      status: f1.status,
      funding_status: f1.funding_status,
      expenses: typeof f1.expenses === 'string' ? JSON.parse(f1.expenses) : f1.expenses || [],
      grant_call_id: f1.grant_call_id,
      grant_call_name: f1.grant_calls?.name || null,
      donor_name: f1.grant_calls?.donors?.name || null,
      emergency_room_id: f1.emergency_room_id,
      err_code: f1.emergency_rooms?.err_code || null,
      err_name: f1.emergency_rooms?.name_ar || f1.emergency_rooms?.name || null,
      submitted_at: f1.submitted_at,
      committed_at: f1.submitted_at,
      funding_cycle_id: f1.funding_cycle_id,
      funding_cycle_name: f1.funding_cycles?.name || null,
      mou_id: f1.mou_id || null,
      file_key: f1.file_key || null,
      temp_file_key: f1.temp_file_key || null,
      grant_id: f1.grant_id || null,
      grant_serial_id: f1.grant_serial_id || null,
      workplan_number: f1.workplan_number || null
    }))

    // Apply client-side filters that can't be done in SQL
    if (search) {
      const searchLower = search.toLowerCase()
      formattedF1s = formattedF1s.filter(f1 => 
        f1.err_id.toLowerCase().includes(searchLower) ||
        f1.state.toLowerCase().includes(searchLower) ||
        f1.locality.toLowerCase().includes(searchLower) ||
        f1.grant_call_name?.toLowerCase().includes(searchLower) ||
        f1.donor_name?.toLowerCase().includes(searchLower)
      )
    }

    if (donor) {
      formattedF1s = formattedF1s.filter(f1 => f1.donor_name === donor)
    }

    return NextResponse.json(formattedF1s)
  } catch (error) {
    console.error('Error fetching committed F1s:', error)
    return NextResponse.json({ error: 'Failed to fetch committed F1s' }, { status: 500 })
  }
}
