import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

// GET /api/grant-calls - Get grant calls with available amounts
export async function GET() {
  try {
    // Get all grant calls
    const { data: grantCalls, error: grantError } = await supabase
      .from('grant_calls')
      .select(`
        id,
        name,
        shortname,
        amount,
        status,
        donor:donors (
          id,
          name,
          short_name
        )
      `)
      .eq('status', 'open')

    if (grantError) throw grantError

    // Get all inclusions for these grant calls
    const { data: inclusions, error: inclusionsError } = await supabase
      .from('cycle_grant_inclusions')
      .select('grant_call_id, amount_included')

    if (inclusionsError) throw inclusionsError

    // Calculate available amounts
    const grantCallsWithAvailable = (grantCalls || []).map(grant => {
      const totalIncluded = (inclusions || [])
        .filter(inc => inc.grant_call_id === grant.id)
        .reduce((sum, inc) => sum + (inc.amount_included || 0), 0)

      return {
        ...grant,
        available_amount: grant.amount ? grant.amount - totalIncluded : null
      }
    })

    // Only return grant calls that have available amount > 0 or null
    const availableGrantCalls = grantCallsWithAvailable.filter(
      grant => grant.available_amount === null || grant.available_amount > 0
    )

    return NextResponse.json(availableGrantCalls)
  } catch (error) {
    console.error('Error fetching grant calls:', error)
    return NextResponse.json({ error: 'Failed to fetch grant calls' }, { status: 500 })
  }
}