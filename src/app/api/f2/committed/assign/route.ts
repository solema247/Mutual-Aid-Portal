import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function POST(request: Request) {
  try {
    const supabase = getSupabaseRouteClient()
    const { f1_ids, funding_cycle_id, grant_call_id, mmyy, grant_serial } = await request.json()
    
    if (!f1_ids || !Array.isArray(f1_ids) || f1_ids.length === 0) {
      return NextResponse.json({ error: 'F1 IDs array is required' }, { status: 400 })
    }
    
    if (!funding_cycle_id || !grant_call_id || !mmyy || !grant_serial) {
      return NextResponse.json({ error: 'Missing required assignment fields' }, { status: 400 })
    }
    
    if (mmyy.length !== 4) {
      return NextResponse.json({ error: 'MMYY must be 4 digits' }, { status: 400 })
    }
    
    // Fetch F1s to get their states and validate
    const { data: f1s, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, state, temp_file_key, file_key, grant_call_id')
      .in('id', f1_ids)
      .eq('funding_status', 'committed')
    
    if (fetchError) throw fetchError
    if (!f1s || f1s.length !== f1_ids.length) {
      return NextResponse.json({ error: 'Some F1s not found or not committed' }, { status: 400 })
    }
    
    // Check if any are already assigned
    const alreadyAssigned = f1s.filter((f1: any) => f1.grant_call_id)
    if (alreadyAssigned.length > 0) {
      return NextResponse.json({ error: 'Some F1s are already assigned' }, { status: 400 })
    }
    
    // Get grant call details
    const { data: grantCall, error: grantCallError } = await supabase
      .from('grant_calls')
      .select('id, name, donor_id')
      .eq('id', grant_call_id)
      .single()
    
    if (grantCallError || !grantCall) {
      return NextResponse.json({ error: 'Grant call not found' }, { status: 404 })
    }
    
    // Get donor short name
    const { data: donor, error: donorError } = await supabase
      .from('donors')
      .select('short_name')
      .eq('id', grantCall.donor_id)
      .single()
    
    if (donorError || !donor) {
      return NextResponse.json({ error: 'Donor not found' }, { status: 404 })
    }
    
    // Determine grant_serial_id
    let grantSerialId: string | null = null
    
    if (grant_serial === 'new') {
      // Create new grant serial
      const { data: stateData } = await supabase
        .from('states')
        .select('state_short')
        .eq('state_name', f1s[0].state)
        .limit(1)
      
      const stateShort = stateData?.[0]?.state_short || 'XX'
      
      const { data: cycleAllocationData } = await supabase
        .from('cycle_state_allocations')
        .select('id')
        .eq('cycle_id', funding_cycle_id)
        .eq('state_name', f1s[0].state)
        .limit(1)
      
      const cycleStateAllocationId = cycleAllocationData?.[0]?.id || null
      
      // Create grant serial - we'll call the API route
      // Use the request origin to automatically get the correct port
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
      const createResp = await fetch(`${baseUrl}/api/fsystem/grant-serials/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funding_cycle_id,
          cycle_state_allocation_id: cycleStateAllocationId,
          grant_call_id,
          state_name: f1s[0].state,
          yymm: mmyy
        })
      })
      
      if (!createResp.ok) {
        return NextResponse.json({ error: 'Failed to create grant serial' }, { status: 500 })
      }
      
      const created = await createResp.json()
      grantSerialId = created?.grant_serial || null
    } else {
      grantSerialId = grant_serial
    }
    
    if (!grantSerialId) {
      return NextResponse.json({ error: 'Failed to get or create grant serial' }, { status: 500 })
    }
    
    // Get cycle_state_allocation_id
    const { data: cycleAllocationData } = await supabase
      .from('cycle_state_allocations')
      .select('id')
      .eq('cycle_id', funding_cycle_id)
      .eq('state_name', f1s[0].state)
      .limit(1)
    
    const cycleStateAllocationId = cycleAllocationData?.[0]?.id || null
    
    // Get initial workplan number from grant_workplan_seq table BEFORE processing F1s
    // This ensures sequential numbering when assigning multiple F1s
    const { data: initialSeqData } = await supabase
      .from('grant_workplan_seq')
      .select('last_workplan_number')
      .eq('grant_serial', grantSerialId)
      .single()
    
    let currentWorkplanNumber = initialSeqData?.last_workplan_number || 0
    
    // Process each F1
    let assignedCount = 0
    const errors: string[] = []
    
    for (const f1 of f1s) {
      try {
        // Get state short name
        const { data: stateData } = await supabase
          .from('states')
          .select('state_short')
          .eq('state_name', f1.state)
          .limit(1)
        
        const stateShort = stateData?.[0]?.state_short || 'XX'
        
        // Increment workplan number for this F1
        currentWorkplanNumber += 1
        const workplanNumber = currentWorkplanNumber
        
        // Update sequence table after each assignment to keep it in sync
        if (initialSeqData) {
          await supabase
            .from('grant_workplan_seq')
            .update({ 
              last_workplan_number: workplanNumber,
              last_used: new Date().toISOString()
            })
            .eq('grant_serial', grantSerialId)
        } else {
          await supabase
            .from('grant_workplan_seq')
            .insert({ 
              grant_serial: grantSerialId, 
              last_workplan_number: workplanNumber,
              last_used: new Date().toISOString(),
              funding_cycle_id: funding_cycle_id || null
            })
        }
        
        // Generate grant_id
        const grantId = `${grantSerialId}-${String(workplanNumber).padStart(3, '0')}`
        
        // Move file if temp_file_key exists
        let finalFileKey = f1.file_key
        
        if (f1.temp_file_key) {
          const ext = f1.temp_file_key.split('.').pop() || 'pdf'
          finalFileKey = `f1-forms/${donor.short_name}/${stateShort}/${mmyy}/${grantId}.${ext}`
          
          const { error: moveError } = await supabase.storage
            .from('images')
            .move(f1.temp_file_key, finalFileKey)
          
          if (moveError) {
            // Fallback: copy then remove
            const { error: copyErr } = await supabase.storage.from('images').copy(f1.temp_file_key, finalFileKey)
            if (copyErr) {
              throw new Error(`Failed to move file: ${copyErr.message}`)
            }
            await supabase.storage.from('images').remove([f1.temp_file_key])
          }
        }
        
        // Update F1 metadata
        const { error: updateError } = await supabase
          .from('err_projects')
          .update({
            grant_call_id,
            donor_id: grantCall.donor_id,
            funding_cycle_id,
            grant_serial_id: grantSerialId,
            workplan_number: workplanNumber,
            cycle_state_allocation_id: cycleStateAllocationId,
            grant_id: grantId,
            file_key: finalFileKey,
            temp_file_key: null
          })
          .eq('id', f1.id)
        
        if (updateError) throw updateError
        
        assignedCount++
      } catch (error: any) {
        console.error(`Error assigning F1 ${f1.id}:`, error)
        errors.push(`F1 ${f1.id}: ${error.message || 'Unknown error'}`)
      }
    }
    
    if (assignedCount === 0) {
      return NextResponse.json({ 
        error: 'Failed to assign any F1s', 
        details: errors 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      assigned_count: assignedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Error assigning F1s:', error)
    return NextResponse.json({ error: 'Failed to assign F1s' }, { status: 500 })
  }
}

