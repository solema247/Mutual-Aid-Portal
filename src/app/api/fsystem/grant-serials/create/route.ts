import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseAdmin()
    const { grant_call_id, funding_cycle_id, cycle_state_allocation_id, state_name, yymm } = await request.json()

    // Debug logging
    console.log('Grant serial creation request:', {
      grant_call_id,
      funding_cycle_id,
      cycle_state_allocation_id,
      state_name,
      yymm
    })

    // Validate required parameters
    if (!state_name || !yymm) {
      console.log('Validation failed: Missing state_name or yymm')
      return NextResponse.json({ error: 'Missing required parameters: state_name and yymm' }, { status: 400 })
    }

    // Must have either grant_call_id (old system) or funding_cycle_id + cycle_state_allocation_id (new system)
    if (!grant_call_id && !funding_cycle_id) {
      console.log('Validation failed: Missing grant_call_id or funding_cycle_id')
      return NextResponse.json({ error: 'Missing required parameter: grant_call_id or funding_cycle_id' }, { status: 400 })
    }

    let grantCall, donor, serialData

    // If grant_call_id is provided, use it directly to get donor info (avoids RLS issues with nested queries)
    if (grant_call_id) {
      console.log('[grant-serials/create] Step 1: Fetching grant call', grant_call_id)
      // Get grant call and donor separately to avoid RLS issues with joins
      const { data: grantCallData, error: grantError } = await supabase
        .from('grant_calls')
        .select('id, shortname, donor_id')
        .eq('id', grant_call_id)
        .single()

      console.log('[grant-serials/create] Step 1 result:', { 
        data: grantCallData, 
        error: grantError,
        errorCode: grantError?.code,
        errorMessage: grantError?.message
      })

      if (grantError) {
        console.error('[grant-serials/create] Grant call query failed:', grantError)
        throw grantError
      }
      if (!grantCallData) {
        throw new Error('Grant call not found')
      }

      if (!grantCallData.donor_id) {
        throw new Error('Grant call has no donor_id')
      }

      console.log('[grant-serials/create] Step 2: Fetching donor', grantCallData.donor_id)
      // Get donor separately
      const { data: donorData, error: donorError } = await supabase
        .from('donors')
        .select('short_name')
        .eq('id', grantCallData.donor_id)
        .single()

      console.log('[grant-serials/create] Step 2 result:', { 
        data: donorData, 
        error: donorError,
        errorCode: donorError?.code,
        errorMessage: donorError?.message
      })

      if (donorError) {
        console.error('[grant-serials/create] Donor query failed:', donorError)
        throw donorError
      }
      if (!donorData?.short_name) {
        throw new Error('Donor short name missing')
      }

      donor = donorData
      console.log('[grant-serials/create] Successfully got donor:', donor.short_name)

      if (funding_cycle_id) {
        // New cycle-based system with grant_call_id
        if (!cycle_state_allocation_id) {
          console.log('Validation failed: Missing cycle_state_allocation_id for cycle-based system')
          return NextResponse.json({ error: 'Missing required parameter: cycle_state_allocation_id' }, { status: 400 })
        }

        serialData = {
          grant_serial: '', // Will be set after counting
          grant_call_id, // Required for database constraint
          funding_cycle_id,
          cycle_state_allocation_id,
          state_name,
          yymm
        }
      } else {
        // Old grant-call-based system
        serialData = {
          grant_serial: '', // Will be set after counting
          grant_call_id,
          state_name,
          yymm
        }
      }
    } else if (funding_cycle_id) {
      // New cycle-based system without grant_call_id (need to query through cycle)
      if (!cycle_state_allocation_id) {
        console.log('Validation failed: Missing cycle_state_allocation_id for cycle-based system')
        return NextResponse.json({ error: 'Missing required parameter: cycle_state_allocation_id' }, { status: 400 })
      }

      // Get cycle grant inclusions to find grant_call_id
      const { data: inclusionsData, error: inclusionsError } = await supabase
        .from('cycle_grant_inclusions')
        .select('grant_call_id')
        .eq('cycle_id', funding_cycle_id)
        .limit(1)

      if (inclusionsError) throw inclusionsError
      if (!inclusionsData || inclusionsData.length === 0) {
        throw new Error('No grants found in funding cycle')
      }

      const grantCallId = inclusionsData[0].grant_call_id
      if (!grantCallId) {
        throw new Error('Grant call ID not found in cycle inclusion')
      }

      // Get the grant call to get donor_id
      const { data: grantCallData, error: grantError } = await supabase
        .from('grant_calls')
        .select('donor_id')
        .eq('id', grantCallId)
        .single()

      if (grantError) throw grantError
      if (!grantCallData?.donor_id) {
        throw new Error('Grant call has no donor_id')
      }

      // Get the donor
      const { data: donorData, error: donorError } = await supabase
        .from('donors')
        .select('short_name')
        .eq('id', grantCallData.donor_id)
        .single()

      if (donorError) throw donorError
      if (!donorData?.short_name) {
        throw new Error('Donor short name missing')
      }

      donor = donorData

      serialData = {
        grant_serial: '', // Will be set after counting
        grant_call_id: grantCallId, // Required for database constraint
        funding_cycle_id,
        cycle_state_allocation_id,
        state_name,
        yymm
      }
    }

    // Get the state details
    console.log('[grant-serials/create] Step 3: Fetching state', state_name)
    const { data: states, error: stateError } = await supabase
      .from('states')
      .select('state_short')
      .eq('state_name', state_name)
      .limit(1)

    console.log('[grant-serials/create] Step 3 result:', { 
      data: states, 
      error: stateError,
      errorCode: stateError?.code,
      errorMessage: stateError?.message
    })

    if (stateError) {
      console.error('[grant-serials/create] State query failed:', stateError)
      throw stateError
    }
    if (!states?.length) {
      throw new Error('State not found')
    }

    const state = states[0]
    console.log('[grant-serials/create] Successfully got state:', state.state_short)

    // Get the next serial number by extracting the highest existing serial number
    // Format: LCC-{donor}-{state}-{yymm}-{serialNumber}
    // We need to find the highest serialNumber for this donor/state/yymm/grant_call combination
    let existingSerialsQuery = supabase
      .from('grant_serials')
      .select('grant_serial')
      .eq('state_name', state_name)
      .eq('yymm', yymm)
      .like('grant_serial', `LCC-${donor.short_name}-${state.state_short.toUpperCase()}-${yymm}-%`)

    // Always filter by grant_call_id if provided (required for uniqueness)
    if (grant_call_id) {
      existingSerialsQuery = existingSerialsQuery.eq('grant_call_id', grant_call_id)
    }
    
    // Also filter by funding_cycle_id if provided
    if (funding_cycle_id) {
      existingSerialsQuery = existingSerialsQuery.eq('funding_cycle_id', funding_cycle_id)
    }

    console.log('[grant-serials/create] Step 4: Fetching existing grant serials')
    const { data: existingSerials, error: serialsError } = await existingSerialsQuery

    console.log('[grant-serials/create] Step 4 result:', { 
      existingSerials, 
      error: serialsError,
      errorCode: serialsError?.code,
      errorMessage: serialsError?.message
    })

    if (serialsError) {
      console.error('[grant-serials/create] Serials query failed:', serialsError)
      throw serialsError
    }

    // Extract serial numbers from existing grant serials
    // Format: LCC-{donor}-{state}-{yymm}-{serialNumber}
    const serialPrefix = `LCC-${donor.short_name}-${state.state_short.toUpperCase()}-${yymm}-`
    let maxSerialNumber = 0
    
    if (existingSerials && existingSerials.length > 0) {
      for (const existingSerial of existingSerials) {
        const serialStr = existingSerial.grant_serial || ''
        if (serialStr.startsWith(serialPrefix)) {
          const serialNumberStr = serialStr.substring(serialPrefix.length)
          const serialNumber = parseInt(serialNumberStr, 10)
          if (!isNaN(serialNumber) && serialNumber > maxSerialNumber) {
            maxSerialNumber = serialNumber
          }
        }
      }
    }

    const nextNumber = maxSerialNumber + 1
    const paddedSerial = nextNumber.toString().padStart(4, '0')
    console.log('[grant-serials/create] Next serial number:', { maxSerialNumber, nextNumber, paddedSerial })

    // Build the serial string (unified format for both systems)
    // Desired format: LCC-DonorShort-StateShort-MMYY-Serial
    const serial = `LCC-${donor.short_name}-${state.state_short.toUpperCase()}-${yymm}-${paddedSerial}`
    console.log('[grant-serials/create] Generated serial:', serial)

    // Insert the new serial
    const insertData = {
      ...serialData,
      grant_serial: serial
    }
    console.log('[grant-serials/create] Step 5: Inserting grant serial', insertData)

    const { data: newSerial, error: insertError } = await supabase
      .from('grant_serials')
      .insert(insertData)
      .select()
      .single()

    console.log('[grant-serials/create] Step 5 result:', { 
      data: newSerial, 
      error: insertError,
      errorCode: insertError?.code,
      errorMessage: insertError?.message
    })

    if (insertError) {
      console.error('[grant-serials/create] Insert query failed:', insertError)
      throw insertError
    }

    // Initialize workplan sequence
    const workplanSeqData: any = {
      grant_serial: serial,
      last_workplan_number: 0
    }

    if (funding_cycle_id) {
      workplanSeqData.funding_cycle_id = funding_cycle_id
    }

    console.log('[grant-serials/create] Step 6: Inserting workplan sequence', workplanSeqData)
    const { error: seqError } = await supabase
      .from('grant_workplan_seq')
      .insert(workplanSeqData)

    console.log('[grant-serials/create] Step 6 result:', { 
      error: seqError,
      errorCode: seqError?.code,
      errorMessage: seqError?.message
    })

    if (seqError) {
      console.error('[grant-serials/create] Workplan sequence insert failed:', seqError)
      throw seqError
    }

    console.log('[grant-serials/create] Success! Created grant serial:', newSerial)
    return NextResponse.json(newSerial)
  } catch (error) {
    console.error('Error creating grant serial:', error)
    return NextResponse.json({ error: 'Failed to create grant serial' }, { status: 500 })
  }
}