import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireGrantEditor } from '@/lib/grantManagement/requireGrantEditor'

/**
 * GET /api/distribution-decisions - List distribution decisions from canonical master sheet.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('distribution_decision_master_sheet_1')
      .select(
        'id, decision_id_proposed, decision_id, grant_name, restriction, sum_allocation_amount, decision_amount, decision_date, partner'
      )
      .order('decision_date', { ascending: false })

    if (error) throw error

    const list = (data || []).map((row) => ({
      id: row.id,
      decision_id: row.decision_id ?? null,
      decision_id_proposed: row.decision_id_proposed ?? null,
      grant_name: row.grant_name ?? null,
      restriction: row.restriction ?? null,
      sum_allocation_amount:
        row.sum_allocation_amount != null ? Number(row.sum_allocation_amount) : null,
      decision_amount: row.decision_amount != null ? Number(row.decision_amount) : null,
      decision_date: row.decision_date ?? null,
      partner: row.partner ?? null,
    }))

    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching distribution decisions:', error)
    return NextResponse.json({ error: 'Failed to fetch distribution decisions' }, { status: 500 })
  }
}

/**
 * POST /api/distribution-decisions - Create a decision in canonical master sheet.
 * Supabase only; sync_status = pending (Airtable push comes later).
 */
export async function POST(request: Request) {
  const auth = await requireGrantEditor()
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()
    const decision_id_proposed =
      typeof body.decision_id_proposed === 'string' ? body.decision_id_proposed.trim() : ''
    const decision_id =
      typeof body.decision_id === 'string' && body.decision_id.trim()
        ? body.decision_id.trim()
        : decision_id_proposed

    if (!decision_id_proposed) {
      return NextResponse.json({ error: 'decision_id_proposed is required' }, { status: 400 })
    }

    const decision_amount =
      body.decision_amount != null ? Number(body.decision_amount) : null
    if (decision_amount == null || Number.isNaN(decision_amount) || decision_amount <= 0) {
      return NextResponse.json({ error: 'decision_amount must be a positive number' }, { status: 400 })
    }

    const row = {
      decision_id_proposed,
      decision_id,
      decision_amount,
      decision_date: typeof body.decision_date === 'string' ? body.decision_date || null : null,
      partner: typeof body.partner === 'string' ? body.partner.trim() || null : null,
      restriction: typeof body.restriction === 'string' ? body.restriction.trim() || null : null,
      notes: typeof body.notes === 'string' ? body.notes.trim() || null : null,
      grant_name: typeof body.grant_name === 'string' ? body.grant_name.trim() || null : null,
      file_name: typeof body.file_name === 'string' ? body.file_name.trim() || null : null,
      file_link: typeof body.file_link === 'string' ? body.file_link.trim() || null : null,
      sum_allocation_amount: 0,
      sync_status: 'pending' as const,
    }

    const { data, error } = await auth.ctx.supabase
      .from('distribution_decision_master_sheet_1')
      .insert(row)
      .select(
        'id, decision_id_proposed, decision_id, grant_name, restriction, sum_allocation_amount, decision_amount, decision_date, partner'
      )
      .single()

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ error: 'Decision ID already exists' }, { status: 409 })
      }
      throw error
    }

    return NextResponse.json(
      {
        id: data.id,
        decision_id: data.decision_id ?? null,
        decision_id_proposed: data.decision_id_proposed ?? null,
        grant_name: data.grant_name ?? null,
        restriction: data.restriction ?? null,
        sum_allocation_amount:
          data.sum_allocation_amount != null ? Number(data.sum_allocation_amount) : null,
        decision_amount: data.decision_amount != null ? Number(data.decision_amount) : null,
        decision_date: data.decision_date ?? null,
        partner: data.partner ?? null,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Error creating distribution decision:', error)
    return NextResponse.json({ error: 'Failed to create distribution decision' }, { status: 500 })
  }
}
