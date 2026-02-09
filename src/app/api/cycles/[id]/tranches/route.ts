import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/cycles/[id]/tranches - list tranches for a cycle
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { data, error } = await supabase
      .from('cycle_tranches')
      .select('*')
      .eq('cycle_id', params.id)
      .order('tranche_no', { ascending: true })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching tranches:', error)
    return NextResponse.json({ error: 'Failed to fetch tranches' }, { status: 500 })
  }
}

// POST /api/cycles/[id]/tranches - create a new tranche
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const body = await request.json()
    const { tranche_no, planned_cap, status } = body

    if (!tranche_no || tranche_no < 1) {
      return NextResponse.json({ error: 'tranche_no is required' }, { status: 400 })
    }

    const insertData: any = {
      cycle_id: params.id,
      tranche_no,
      planned_cap: Number(planned_cap) || 0,
      status: status || 'open'
    }

    const { data, error } = await supabase
      .from('cycle_tranches')
      .insert(insertData)
      .select()
      .single()

    if (error) throw error
    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating tranche:', error)
    return NextResponse.json({ error: 'Failed to create tranche' }, { status: 500 })
  }
}

// PATCH /api/cycles/[id]/tranches - bulk or single update by tranche_no
export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const body = await request.json()
    const { tranche_no, status, planned_cap } = body

    if (!tranche_no) {
      return NextResponse.json({ error: 'tranche_no is required' }, { status: 400 })
    }

    // Check existence
    const { data: existing, error: existsErr } = await supabase
      .from('cycle_tranches')
      .select('id')
      .eq('cycle_id', params.id)
      .eq('tranche_no', tranche_no)
      .maybeSingle()
    if (existsErr) throw existsErr

    const updateData: any = {}
    if (status !== undefined) updateData.status = status
    if (planned_cap !== undefined) updateData.planned_cap = Number(planned_cap) || 0

    if (!existing) {
      // Insert new tranche row
      const insertData: any = {
        cycle_id: params.id,
        tranche_no,
        planned_cap: updateData.planned_cap ?? 0,
        // Default new tranches to 'closed' unless explicitly set
        status: updateData.status ?? 'closed'
      }
      const { data: inserted, error: insertErr } = await supabase
        .from('cycle_tranches')
        .insert(insertData)
        .select()
        .single()
      if (insertErr) throw insertErr
      return NextResponse.json(inserted)
    } else {
      // Update existing tranche row
      const { data: updated, error: updateErr } = await supabase
        .from('cycle_tranches')
        .update(updateData)
        .eq('cycle_id', params.id)
        .eq('tranche_no', tranche_no)
        .select()
        .single()
      if (updateErr) throw updateErr
      return NextResponse.json(updated)
    }
  } catch (error) {
    console.error('Error updating tranche:', error)
    return NextResponse.json({ error: 'Failed to update tranche' }, { status: 500 })
  }
}


