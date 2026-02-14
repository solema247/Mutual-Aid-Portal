import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'
import { userCanAccessAllStates } from '@/lib/userStateAccess'

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('f3_reassign_mou')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const mouId = params.id
    const { grant_id, donor_name, mmyy } = await request.json()
    
    if (!grant_id || !donor_name || !mmyy) {
      return NextResponse.json({ error: 'Missing required reassignment fields' }, { status: 400 })
    }
    
    if (mmyy.length !== 4) {
      return NextResponse.json({ error: 'MMYY must be 4 digits' }, { status: 400 })
    }
    
    // Fetch all projects linked to this MOU that are assigned (have grant_id starting with LCC-)
    const { data: f1s, error: fetchError } = await supabase
      .from('err_projects')
      .select('id, state, file_key, grant_id, donor_id')
      .eq('mou_id', mouId)
      .eq('funding_status', 'committed')
      .not('grant_id', 'is', null)
    
    if (fetchError) throw fetchError
    if (!f1s || f1s.length === 0) {
      return NextResponse.json({ error: 'No assigned projects found for this MOU' }, { status: 400 })
    }
    
    // Filter to only projects that are already assigned (have grant_id starting with LCC-)
    const assignedF1s = f1s.filter((f1: any) => f1.grant_id && f1.grant_id.startsWith('LCC-'))
    if (assignedF1s.length === 0) {
      return NextResponse.json({ error: 'No assigned projects found for this MOU' }, { status: 400 })
    }
    const canAccess = await userCanAccessAllStates(assignedF1s.map((f: any) => f.state))
    if (!canAccess) {
      return NextResponse.json({ error: 'You do not have access to this MOU or its projects' }, { status: 403 })
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
    
    // Remove old serials from old grants' activities if they exist
    for (const f1 of assignedF1s) {
      if (f1.grant_id && f1.grant_id.startsWith('LCC-')) {
        // Find which grant this serial belongs to
        const { data: oldGrants } = await supabase
          .from('grants_grid_view')
          .select('grant_id, donor_name, activities')
        
        for (const oldGrant of oldGrants || []) {
          if (oldGrant.activities && oldGrant.activities.includes(f1.grant_id)) {
            const updatedActivities = oldGrant.activities
              .split(',')
              .map((s: string) => s.trim())
              .filter((s: string) => s !== f1.grant_id)
              .join(',')
            
            await supabase
              .from('grants_grid_view')
              .update({ activities: updatedActivities || null })
              .eq('grant_id', oldGrant.grant_id)
              .eq('donor_name', oldGrant.donor_name)
            break
          }
        }
      }
    }
    
    // Get initial workplan sequence from grants_grid_view
    let currentWorkplanNumber = grant.max_workplan_sequence || 0
    
    // Process each F1
    let reassignedCount = 0
    const errors: string[] = []
    
    for (const f1 of assignedF1s) {
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
        
        // Move file to new location
        let finalFileKey = f1.file_key
        
        if (f1.file_key) {
          const ext = f1.file_key.split('.').pop() || 'pdf'
          finalFileKey = `f1-forms/${donorShortName}/${stateShort}/${mmyy}/${generatedSerial}.${ext}`
          
          if (f1.file_key !== finalFileKey) {
            const { error: moveError } = await supabase.storage
              .from('images')
              .move(f1.file_key, finalFileKey)
            
            if (moveError) {
              // Fallback: copy then remove
              const { error: copyErr } = await supabase.storage.from('images').copy(f1.file_key, finalFileKey)
              if (copyErr) {
                throw new Error(`Failed to move file: ${copyErr.message}`)
              }
              await supabase.storage.from('images').remove([f1.file_key])
            }
          }
        }
        
        // Update F1 metadata
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
          // Don't fail the reassignment, but log the error
        }
        
        // Update grant reference for next iteration
        grant.max_workplan_sequence = workplanNumber
        grant.activities = updatedActivities
        
        reassignedCount++
      } catch (error: any) {
        console.error(`Error reassigning F1 ${f1.id}:`, error)
        errors.push(`F1 ${f1.id}: ${error.message || 'Unknown error'}`)
      }
    }
    
    if (reassignedCount === 0) {
      return NextResponse.json({ 
        error: 'Failed to reassign any projects', 
        details: errors 
      }, { status: 500 })
    }
    
    return NextResponse.json({ 
      success: true, 
      reassigned_count: reassignedCount,
      errors: errors.length > 0 ? errors : undefined
    })
  } catch (error) {
    console.error('Error reassigning MOU to grant:', error)
    return NextResponse.json({ error: 'Failed to reassign MOU to grant' }, { status: 500 })
  }
}

