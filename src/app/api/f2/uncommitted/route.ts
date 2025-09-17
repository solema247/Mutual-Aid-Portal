import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/f2/uncommitted - Get all uncommitted F1s
export async function GET() {
  try {
    const { data, error } = await supabase
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
        submitted_at
      `)
      .eq('funding_status', 'allocated')
      .order('submitted_at', { ascending: false })

    if (error) throw error

    const formattedF1s = (data || []).map((f1: any) => ({
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
      submitted_at: f1.submitted_at
    }))

    return NextResponse.json(formattedF1s)
  } catch (error) {
    console.error('Error fetching uncommitted F1s:', error)
    return NextResponse.json({ error: 'Failed to fetch uncommitted F1s' }, { status: 500 })
  }
}

// PATCH /api/f2/uncommitted - Update F1 expenses or grant call
export async function PATCH(request: Request) {
  try {
    const { id, expenses, grant_call_id } = await request.json()
    
    if (!id) {
      return NextResponse.json({ error: 'F1 ID is required' }, { status: 400 })
    }

    const updateData: any = {}
    if (expenses !== undefined) updateData.expenses = expenses
    if (grant_call_id !== undefined) updateData.grant_call_id = grant_call_id

    const { error } = await supabase
      .from('err_projects')
      .update(updateData)
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating F1:', error)
    return NextResponse.json({ error: 'Failed to update F1' }, { status: 500 })
  }
}

// POST /api/f2/uncommitted/commit - Commit selected F1s
export async function POST(request: Request) {
  try {
    const { f1_ids } = await request.json()
    
    if (!f1_ids || !Array.isArray(f1_ids) || f1_ids.length === 0) {
      return NextResponse.json({ error: 'F1 IDs array is required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('err_projects')
      .update({ funding_status: 'committed' })
      .in('id', f1_ids)

    if (error) throw error

    return NextResponse.json({ 
      success: true, 
      committed_count: f1_ids.length 
    })
  } catch (error) {
    console.error('Error committing F1s:', error)
    return NextResponse.json({ error: 'Failed to commit F1s' }, { status: 500 })
  }
}
