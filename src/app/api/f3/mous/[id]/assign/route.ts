import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const mouId = params.id
    const { grant_id, donor_name, mmyy } = await request.json()
    
    if (!grant_id || !donor_name || !mmyy) {
      return NextResponse.json({ error: 'Missing required assignment fields' }, { status: 400 })
    }
    
    if (mmyy.length !== 4) {
      return NextResponse.json({ error: 'MMYY must be 4 digits' }, { status: 400 })
    }
    
    // Fetch all projects linked to this MOU
    const { data: f1s, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, state, temp_file_key, file_key, grant_id, mou_id')
      .eq('mou_id', mouId)
      .eq('funding_status', 'committed')
      .eq('status', 'approved')
    
    if (fetchError) throw fetchError
    if (!f1s || f1s.length === 0) {
      return NextResponse.json({ error: 'No committed and approved projects found for this MOU' }, { status: 400 })
    }
    
    // Check if any are already assigned (check if grant_id exists and matches the pattern)
    const alreadyAssigned = f1s.filter((f1: any) => {
      // A project is assigned if it has a grant_id that looks like a serial (starts with LCC-)
      return f1.grant_id && f1.grant_id.startsWith('LCC-')
    })
    if (alreadyAssigned.length > 0) {
      return NextResponse.json({ error: 'Some projects in this MOU are already assigned to a grant' }, { status: 400 })
    }
    
    // Get grant from grants_grid_view
    const { data: grant, error: grantError } = await supabase
      .from('grants_grid_view')
      .select('id, grant_id, donor_name, donor_id, max_workplan_sequence, activities')
      .eq('grant_id', grant_id)
      .eq('donor_name', donor_name)
      .single()
    
    if (grantError || !grant) {
      return NextResponse.json({ error: 'Grant not found in grants_grid_view. Please ensure the grant exists.' }, { status: 404 })
    }
    
    // Get donor short name from donors table
    let donorShortName = ''
    if (grant.donor_id) {
      const { data: donor, error: donorError } = await supabase
        .from('donors')
        .select('short_name')
        .eq('id', grant.donor_id)
        .single()
      
      if (donorError || !donor) {
        return NextResponse.json({ error: 'Donor not found' }, { status: 404 })
      }
      donorShortName = donor.short_name || ''
    } else {
      // Fallback: try to get from donor_name if donor_id is not available
      const { data: donor, error: donorError } = await supabase
        .from('donors')
        .select('short_name')
        .eq('name', donor_name)
        .single()
      
      if (donorError || !donor) {
        return NextResponse.json({ error: 'Donor not found' }, { status: 404 })
      }
      donorShortName = donor.short_name || ''
    }
    
    if (!donorShortName) {
      return NextResponse.json({ error: 'Donor short name not found' }, { status: 404 })
    }
    
    // Get initial workplan sequence from grants_grid_view
    let currentWorkplanNumber = grant.max_workplan_sequence || 0
    
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
        
        // Generate serial: LCC-DonorShort-StateShort-MMYY-WorkplanSeq
        const generatedSerial = `LCC-${donorShortName}-${stateShort}-${mmyy}-${String(workplanNumber).padStart(4, '0')}`
        
        // Move file if temp_file_key exists
        let finalFileKey = f1.file_key
        
        if (f1.temp_file_key) {
          const ext = f1.temp_file_key.split('.').pop() || 'pdf'
          finalFileKey = `f1-forms/${donorShortName}/${stateShort}/${mmyy}/${generatedSerial}.${ext}`
          
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
        
        // Update F1 metadata and activate project
        const { error: updateError } = await supabase
          .from('err_projects')
          .update({
            grant_id: generatedSerial, // Store the generated serial (LCC-DonorShort-StateShort-MMYY-WorkplanSeq)
            grant_grid_id: grant.id, // Link to grants_grid_view
            donor_id: grant.donor_id,
            workplan_number: workplanNumber,
            file_key: finalFileKey,
            temp_file_key: null,
            status: 'active'
          })
          .eq('id', f1.id)
        
        if (updateError) throw updateError
        
        // Update grants_grid_view: increment max_workplan_sequence and append to activities
        const updatedActivities = grant.activities 
          ? `${grant.activities},${generatedSerial}`
          : generatedSerial
        
        const { error: updateGrantError } = await supabase
          .from('grants_grid_view')
          .update({
            max_workplan_sequence: workplanNumber,
            activities: updatedActivities
          })
          .eq('grant_id', grant_id)
          .eq('donor_name', donor_name)
        
        if (updateGrantError) {
          console.error('Error updating grants_grid_view:', updateGrantError)
          // Don't fail the assignment, but log the error
        }
        
        // Update grant reference for next iteration
        grant.max_workplan_sequence = workplanNumber
        grant.activities = updatedActivities
        
        assignedCount++
      } catch (error: any) {
        console.error(`Error assigning F1 ${f1.id}:`, error)
        errors.push(`F1 ${f1.id}: ${error.message || 'Unknown error'}`)
      }
    }
    
    if (assignedCount === 0) {
      return NextResponse.json({ 
        error: 'Failed to assign any projects', 
        details: errors 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      assigned_count: assignedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Error assigning MOU to grant:', error)
    return NextResponse.json({ error: 'Failed to assign MOU to grant' }, { status: 500 })
  }
}

