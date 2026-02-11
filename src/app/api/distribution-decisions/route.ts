import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

// GET /api/distribution-decisions - list distribution decisions
// POST /api/distribution-decisions - create a distribution decision (decoupled from grants)
export async function GET() {
  try {
    const supabase = getSupabaseRouteClient()

    const { data, error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select(`
        id,
        decision_id_proposed,
        decision_id,
        partner,
        grant_name,
        decision_amount,
        sum_allocation_amount,
        decision_date,
        file_name,
        file_link,
        fund_request,
        transfer_segment,
        allocation_id,
        notes,
        restriction,
        created_at,
        updated_at
      `)
      .order('decision_date', { ascending: false })
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error) {
    console.error('Error fetching distribution decisions:', error)
    return NextResponse.json({ error: 'Failed to fetch distribution decisions' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requirePermission('grant_create_decision')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const body = await request.json()

    const {
      decision_id,
      decision_id_proposed,
      decision_amount,
      decision_date,
      partner,
      grant_name,
      fund_request,
      transfer_segment,
      file_name,
      file_link,
      notes,
      restriction,
    } = body || {}

    if (!decision_id || decision_amount === undefined || decision_amount === null) {
      return NextResponse.json({ error: 'decision_id and decision_amount are required' }, { status: 400 })
    }

    const insertPayload = {
      decision_id,
      decision_id_proposed: decision_id_proposed || decision_id,
      decision_amount: Number(decision_amount),
      decision_date: decision_date || null,
      partner: partner || null,
      grant_name: grant_name || null,
      fund_request: fund_request || null,
      transfer_segment: transfer_segment || null,
      file_name: file_name || null,
      file_link: file_link || null,
      notes: notes || null,
      restriction: restriction || null,
      sum_allocation_amount: 0,
    }

    const { data, error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .insert([insertPayload])
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error creating distribution decision:', error)
    return NextResponse.json({ error: 'Failed to create distribution decision' }, { status: 500 })
  }
}

