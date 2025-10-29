import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// GET /api/cycles - Get all funding cycles
export async function GET(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const year = searchParams.get('year')

    let query = supabase
      .from('funding_cycles')
      .select(`
        *,
        cycle_grant_inclusions (
          id,
          amount_included,
          grant_calls (
            id,
            name,
            shortname,
            amount,
            donor:donors (
              id,
              name,
              short_name
            )
          )
        ),
        cycle_state_allocations (
          id,
          state_name,
          amount,
          decision_no
        )
      `)
      .order('year', { ascending: false })
      .order('cycle_number', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    if (year) {
      query = query.eq('year', parseInt(year))
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching funding cycles:', error)
    return NextResponse.json({ error: 'Failed to fetch funding cycles' }, { status: 500 })
  }
}

// POST /api/cycles - Create new funding cycle
export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const body = await request.json()
    const { cycle_number, year, name, start_date, end_date, grant_inclusions, type, tranche_count, pool_amount, tranche_splits } = body

    // Validate required fields
    if (!cycle_number || !year || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Check if cycle already exists
    const { data: existingCycle, error: checkError } = await supabase
      .from('funding_cycles')
      .select('id')
      .eq('cycle_number', cycle_number)
      .eq('year', year)
      .single()

    if (checkError && checkError.code !== 'PGRST116') {
      throw checkError
    }

    if (existingCycle) {
      return NextResponse.json({ error: 'Cycle already exists for this year' }, { status: 400 })
    }

    // Create the funding cycle
    const { data: newCycle, error: cycleError } = await supabase
      .from('funding_cycles')
      .insert({
        cycle_number,
        year,
        name,
        start_date,
        end_date,
        status: 'open',
        type,
        tranche_count,
        pool_amount,
        tranche_splits
      })
      .select()
      .single()

    if (cycleError) throw cycleError

    // Add grant inclusions if provided
    if (grant_inclusions && grant_inclusions.length > 0) {
      const inclusions = grant_inclusions.map((inclusion: any) => ({
        cycle_id: newCycle.id,
        grant_call_id: inclusion.grant_call_id,
        amount_included: inclusion.amount_included
      }))

      const { error: inclusionsError } = await supabase
        .from('cycle_grant_inclusions')
        .insert(inclusions)

      if (inclusionsError) throw inclusionsError
    }

    return NextResponse.json(newCycle)
  } catch (error) {
    console.error('Error creating funding cycle:', error)
    return NextResponse.json({ error: 'Failed to create funding cycle' }, { status: 500 })
  }
}
