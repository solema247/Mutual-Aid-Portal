import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const { grant_call_id, funding_cycle_id, cycle_state_allocation_id, state_name, yymm } = await request.json()

    // Validate required parameters
    if (!state_name || !yymm) {
      return NextResponse.json({ error: 'Missing required parameters: state_name and yymm' }, { status: 400 })
    }

    // Must have either grant_call_id (old system) or funding_cycle_id + cycle_state_allocation_id (new system)
    if (!grant_call_id && !funding_cycle_id) {
      return NextResponse.json({ error: 'Missing required parameter: grant_call_id or funding_cycle_id' }, { status: 400 })
    }

    let grantCall, donor, serialData

    if (funding_cycle_id) {
      // New cycle-based system
      if (!cycle_state_allocation_id) {
        return NextResponse.json({ error: 'Missing required parameter: cycle_state_allocation_id' }, { status: 400 })
      }

      // Get cycle and allocation details
      const { data: cycleData, error: cycleError } = await supabase
        .from('funding_cycles')
        .select(`
          id,
          cycle_grant_inclusions (
            grant_calls (
              shortname,
              donor:donors!inner(short_name)
            )
          )
        `)
        .eq('id', funding_cycle_id)
        .single()

      if (cycleError) throw cycleError

      // Get the first grant from the cycle (for donor info)
      const firstGrant = cycleData.cycle_grant_inclusions?.[0]?.grant_calls
      if (!firstGrant) {
        throw new Error('No grants found in funding cycle')
      }

      donor = Array.isArray(firstGrant.donor) ? firstGrant.donor[0] : firstGrant.donor
      if (!donor?.short_name) {
        throw new Error('Donor short name missing')
      }

      serialData = {
        grant_serial: '', // Will be set after counting
        funding_cycle_id,
        cycle_state_allocation_id,
        state_name,
        yymm
      }
    } else {
      // Old grant-call-based system
      const { data: grantCallData, error: grantError } = await supabase
        .from('grant_calls')
        .select('shortname, donor:donors!inner(short_name)')
        .eq('id', grant_call_id)
        .single()

      if (grantError) throw grantError
      if (!grantCallData) {
        throw new Error('Grant call not found')
      }

      donor = Array.isArray(grantCallData.donor) ? grantCallData.donor[0] : grantCallData.donor
      if (!donor?.short_name) {
        throw new Error('Donor short name missing')
      }

      serialData = {
        grant_serial: '', // Will be set after counting
        grant_call_id,
        state_name,
        yymm
      }
    }

    // Get the state details
    const { data: states, error: stateError } = await supabase
      .from('states')
      .select('state_short')
      .eq('state_name', state_name)
      .limit(1)

    if (stateError) throw stateError
    if (!states?.length) {
      throw new Error('State not found')
    }

    const state = states[0]

    // Get the next serial number (count + 1)
    let countQuery = supabase
      .from('grant_serials')
      .select('*', { count: 'exact', head: true })
      .eq('state_name', state_name)
      .eq('yymm', yymm)

    if (funding_cycle_id) {
      countQuery = countQuery.eq('funding_cycle_id', funding_cycle_id)
    } else {
      countQuery = countQuery.eq('grant_call_id', grant_call_id)
    }

    const { count, error: countError } = await countQuery

    if (countError) throw countError

    const nextNumber = (count || 0) + 1
    const paddedSerial = nextNumber.toString().padStart(4, '0')

    // Build the serial string
    const serial = `LCC-${donor.short_name}-${state.state_short.toUpperCase()}-${yymm}-${paddedSerial}`

    // Insert the new serial
    const insertData = {
      ...serialData,
      grant_serial: serial
    }

    const { data: newSerial, error: insertError } = await supabase
      .from('grant_serials')
      .insert(insertData)
      .select()
      .single()

    if (insertError) throw insertError

    // Initialize workplan sequence
    const workplanSeqData = {
      grant_serial: serial,
      last_workplan_number: 0
    }

    if (funding_cycle_id) {
      workplanSeqData.funding_cycle_id = funding_cycle_id
    }

    const { error: seqError } = await supabase
      .from('grant_workplan_seq')
      .insert(workplanSeqData)

    if (seqError) throw seqError

    return NextResponse.json(newSerial)
  } catch (error) {
    console.error('Error creating grant serial:', error)
    return NextResponse.json({ error: 'Failed to create grant serial' }, { status: 500 })
  }
}