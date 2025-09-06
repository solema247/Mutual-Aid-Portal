import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function POST(request: Request) {
  try {
    const { grant_call_id, state_name, yymm } = await request.json()

    if (!grant_call_id || !state_name || !yymm) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
    }

    // Get the grant call details to build the serial
    const { data: grantCall, error: grantError } = await supabase
      .from('grant_calls')
      .select('shortname, donor:donors!inner(short_name)')
      .eq('id', grant_call_id)
      .single()

    if (grantError) {
      console.error('Error fetching grant call:', grantError)
      throw new Error('Failed to fetch grant call details')
    }
    
    if (!grantCall) {
      console.error('Grant call not found:', grant_call_id)
      throw new Error('Grant call not found')
    }

    // Handle the donor data - it might be an array from the join
    const donor = Array.isArray(grantCall.donor) ? grantCall.donor[0] : grantCall.donor
    if (!donor?.short_name) {
      console.error('Donor short name missing for grant call:', grant_call_id)
      throw new Error('Donor short name missing')
    }

    // Get the state details - get first state with this name since they share the same short code
    const { data: states, error: stateError } = await supabase
      .from('states')
      .select('state_short')
      .eq('state_name', state_name)
      .limit(1)

    if (stateError) {
      console.error('Error fetching state:', stateError)
      throw new Error('Failed to fetch state details')
    }

    if (!states?.length) {
      console.error('State not found:', state_name)
      throw new Error('State not found')
    }

    const state = states[0]

    // Get the next serial number (count + 1)
    const { count, error: countError } = await supabase
      .from('grant_serials')
      .select('*', { count: 'exact', head: true })
      .eq('grant_call_id', grant_call_id)
      .eq('state_name', state_name)
      .eq('yymm', yymm)

    if (countError) {
      console.error('Error getting serial count:', countError)
      throw new Error('Failed to get serial count')
    }

    const nextNumber = (count || 0) + 1
    const paddedSerial = nextNumber.toString().padStart(4, '0')

    // Build the serial string
    const serial = `LCC-${donor.short_name}-${state.state_short.toUpperCase()}-${yymm}-${paddedSerial}`

    // Insert the new serial (removed created_by field)
    const { data: newSerial, error: insertError } = await supabase
      .from('grant_serials')
      .insert({
        grant_serial: serial,
        grant_call_id,
        state_name,
        yymm
      })
      .select()
      .single()

    if (insertError) throw insertError

    // Initialize workplan sequence
    const { error: seqError } = await supabase
      .from('grant_workplan_seq')
      .insert({
        grant_serial: serial,
        last_workplan_number: 0
      })

    if (seqError) throw seqError

    return NextResponse.json(newSerial)
  } catch (error) {
    console.error('Error creating grant serial:', error)
    return NextResponse.json({ error: 'Failed to create grant serial' }, { status: 500 })
  }
}