import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// POST /api/cycles/[id]/grants - Add grants to a cycle
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: cycleId } = params
    const { grant_inclusions } = await request.json()

    // Enforce single grant call per cycle: check if cycle already has a grant call
    const { data: existingInclusions, error: checkError } = await supabase
      .from('cycle_grant_inclusions')
      .select('id')
      .eq('cycle_id', cycleId)

    if (checkError) {
      console.error('Error checking existing inclusions:', checkError)
      return NextResponse.json(
        { error: 'Failed to check existing inclusions' },
        { status: 500 }
      )
    }

    // If cycle already has a grant call, reject the request
    if (existingInclusions && existingInclusions.length > 0) {
      return NextResponse.json(
        { error: 'This cycle already has a grant call. Only one grant call per cycle is allowed.' },
        { status: 400 }
      )
    }

    // Validate that only one grant inclusion is being added
    if (!grant_inclusions || grant_inclusions.length === 0) {
      return NextResponse.json(
        { error: 'At least one grant inclusion is required' },
        { status: 400 }
      )
    }

    if (grant_inclusions.length > 1) {
      return NextResponse.json(
        { error: 'Only one grant call per cycle is allowed' },
        { status: 400 }
      )
    }

    // Validate each grant inclusion
    for (const inclusion of grant_inclusions) {
      // Get the grant call
      const { data: grantCall, error: grantError } = await supabase
        .from('grant_calls')
        .select('amount')
        .eq('id', inclusion.grant_call_id)
        .single()

      if (grantError) {
        console.error('Error fetching grant call:', grantError)
        return NextResponse.json(
          { error: 'Failed to fetch grant call' },
          { status: 500 }
        )
      }

      // Get existing inclusions for this grant
      const { data: existingInclusions, error: inclusionsError } = await supabase
        .from('cycle_grant_inclusions')
        .select('amount_included')
        .eq('grant_call_id', inclusion.grant_call_id)

      if (inclusionsError) {
        console.error('Error fetching existing inclusions:', inclusionsError)
        return NextResponse.json(
          { error: 'Failed to fetch existing inclusions' },
          { status: 500 }
        )
      }

      // Calculate total amount already included
      const totalIncluded = (existingInclusions || []).reduce(
        (sum, inc) => sum + (inc.amount_included || 0),
        0
      )

      // Check if we would exceed the grant amount
      if (grantCall?.amount !== null) {
        const availableAmount = grantCall.amount - totalIncluded
        if (inclusion.amount_included > availableAmount) {
          return NextResponse.json(
            { 
              error: 'Amount exceeds available grant amount',
              grant_id: inclusion.grant_call_id,
              available_amount: availableAmount
            },
            { status: 400 }
          )
        }
      }
    }

    // Insert the inclusions
    const { error: insertError } = await supabase
      .from('cycle_grant_inclusions')
      .insert(
        grant_inclusions.map((inc: any) => ({
          cycle_id: cycleId,
          grant_call_id: inc.grant_call_id,
          amount_included: inc.amount_included
        }))
      )

    if (insertError) {
      console.error('Error inserting grant inclusions:', insertError)
      return NextResponse.json(
        { error: 'Failed to insert grant inclusions' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error adding grants to cycle:', error)
    return NextResponse.json(
      { error: 'Failed to add grants to cycle' },
      { status: 500 }
    )
  }
}

// GET /api/cycles/[id]/grants - Get grants included in a cycle
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: cycleId } = params

    const { data, error } = await supabase
      .from('cycle_grant_inclusions')
      .select(`
        id,
        cycle_id,
        grant_call_id,
        amount_included,
        created_at,
        created_by,
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
      `)
      .eq('cycle_id', cycleId)

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching cycle grants:', error)
    return NextResponse.json(
      { error: 'Failed to fetch cycle grants' },
      { status: 500 }
    )
  }
}