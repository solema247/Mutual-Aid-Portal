import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const grant_call_id = searchParams.get('grant_call_id')
  const funding_cycle_id = searchParams.get('funding_cycle_id')
  const state_name = searchParams.get('state_name')
  const yymm = searchParams.get('yymm')

  // Validate required parameters
  if (!state_name || !yymm) {
    return NextResponse.json({ error: 'Missing required parameters: state_name and yymm' }, { status: 400 })
  }

  // Must have either grant_call_id (old system) or funding_cycle_id (new system)
  if (!grant_call_id && !funding_cycle_id) {
    return NextResponse.json({ error: 'Missing required parameter: grant_call_id or funding_cycle_id' }, { status: 400 })
  }

  try {
    let query = supabase
      .from('grant_serials')
      .select('*')
      .eq('state_name', state_name)
      .eq('yymm', yymm)

    // Use the appropriate parameter based on what's provided
    if (funding_cycle_id) {
      // New cycle-based system
      query = query.eq('funding_cycle_id', funding_cycle_id)
    } else if (grant_call_id) {
      // Old grant-call-based system
      query = query.eq('grant_call_id', grant_call_id)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching grant serials:', error)
    return NextResponse.json({ error: 'Failed to fetch grant serials' }, { status: 500 })
  }
}
