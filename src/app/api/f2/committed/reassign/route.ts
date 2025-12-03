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
    
    // Fetch F1s to get their current assignment and file info
    const { data: f1s, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, state, file_key, grant_serial_id, workplan_number, funding_cycle_id, cycle_state_allocation_id, donor_id')
      .in('id', f1_ids)
      .eq('funding_status', 'committed')
    
    if (fetchError) throw fetchError
    if (!f1s || f1s.length !== f1_ids.length) {
      return NextResponse.json({ error: 'Some F1s not found or not committed' }, { status: 400 })
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
      // In production, use the full URL; in development, use localhost
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
        (process.env.NODE_ENV === 'production' 
          ? `https://${process.env.VERCEL_URL || 'your-domain.com'}` 
          : 'http://localhost:3000')
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
    
    // Process each F1
    let reassignedCount = 0
    const errors: string[] = []
    
    for (const f1 of f1s) {
      try {
        const oldGrantSerialId = f1.grant_serial_id
        const oldFileKey = f1.file_key
        const oldWorkplanNumber = f1.workplan_number
        
        // Decrement workplan sequence for old grant serial if it exists
        if (oldGrantSerialId && oldWorkplanNumber) {
          const { data: oldSeqData } = await supabase
            .from('grant_workplan_seq')
            .select('last_workplan_number')
            .eq('grant_serial', oldGrantSerialId)
            .single()
          
          if (oldSeqData && oldSeqData.last_workplan_number > 0) {
            await supabase
              .from('grant_workplan_seq')
              .update({ last_workplan_number: oldSeqData.last_workplan_number - 1 })
              .eq('grant_serial', oldGrantSerialId)
          }
        }
        
        // Get state short name
        const { data: stateData } = await supabase
          .from('states')
          .select('state_short')
          .eq('state_name', f1.state)
          .limit(1)
        
        const stateShort = stateData?.[0]?.state_short || 'XX'
        
        // Get workplan number for new serial
        let workplanNumber = 1
        
        if (grant_serial !== 'new') {
          // Get last workplan number for this serial
          const { data: seqData } = await supabase
            .from('grant_workplan_seq')
            .select('last_workplan_number')
            .eq('grant_serial', grantSerialId)
            .single()
          
          workplanNumber = seqData ? seqData.last_workplan_number + 1 : 1
          
          // Update sequence
          if (seqData) {
            await supabase
              .from('grant_workplan_seq')
              .update({ last_workplan_number: workplanNumber })
              .eq('grant_serial', grantSerialId)
          } else {
            await supabase
              .from('grant_workplan_seq')
              .insert({ grant_serial: grantSerialId, last_workplan_number: workplanNumber })
          }
        } else {
          // New serial, first workplan is 1
          workplanNumber = 1
          await supabase
            .from('grant_workplan_seq')
            .update({ last_workplan_number: workplanNumber, last_used: new Date().toISOString() })
            .eq('grant_serial', grantSerialId)
        }
        
        // Generate new grant_id
        const newGrantId = `${grantSerialId}-${String(workplanNumber).padStart(3, '0')}`
        
        // Move file to new location
        let newFileKey = oldFileKey
        
        if (oldFileKey) {
          const ext = oldFileKey.split('.').pop() || 'pdf'
          newFileKey = `f1-forms/${donor.short_name}/${stateShort}/${mmyy}/${newGrantId}.${ext}`
          
          if (oldFileKey !== newFileKey) {
            const { error: moveError } = await supabase.storage
              .from('images')
              .move(oldFileKey, newFileKey)
            
            if (moveError) {
              // Fallback: copy then remove
              const { error: copyErr } = await supabase.storage.from('images').copy(oldFileKey, newFileKey)
              if (copyErr) {
                throw new Error(`Failed to move file: ${copyErr.message}`)
              }
              await supabase.storage.from('images').remove([oldFileKey])
            }
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
            grant_id: newGrantId,
            file_key: newFileKey
          })
          .eq('id', f1.id)
        
        if (updateError) throw updateError
        
        reassignedCount++
      } catch (error: any) {
        console.error(`Error reassigning F1 ${f1.id}:`, error)
        errors.push(`F1 ${f1.id}: ${error.message || 'Unknown error'}`)
      }
    }
    
    if (reassignedCount === 0) {
      return NextResponse.json({ 
        error: 'Failed to reassign any F1s', 
        details: errors 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      reassigned_count: reassignedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Error reassigning F1s:', error)
    return NextResponse.json({ error: 'Failed to reassign F1s' }, { status: 500 })
  }
}

