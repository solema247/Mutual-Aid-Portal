import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

/**
 * GET /api/distribution-decisions - List distribution decisions from foreign table.
 * Uses service role to read public.distribution_decision.
 */
export async function GET() {
  try {
    const supabase = getSupabaseAdmin()
    const { data, error } = await supabase
      .from('distribution_decision')
      .select('decision_id_proposed, grant_name, restriction, sum_allocation_amount, decision_id')
      .order('decision_date', { ascending: false })

    if (error) throw error

    const list = (data || []).map((row: Record<string, unknown>, index: number) => ({
      id: (row.decision_id as string) ?? `dec-${index}`,
      decision_id: row.decision_id ?? null,
      decision_id_proposed: row.decision_id_proposed ?? null,
      grant_name: row.grant_name ?? null,
      restriction: row.restriction ?? null,
      sum_allocation_amount: row.sum_allocation_amount != null ? Number(row.sum_allocation_amount) : null,
    }))

    return NextResponse.json(list)
  } catch (error) {
    console.error('Error fetching distribution decisions:', error)
    return NextResponse.json({ error: 'Failed to fetch distribution decisions' }, { status: 500 })
  }
}
