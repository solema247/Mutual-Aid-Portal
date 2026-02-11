import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

// POST /api/f3/mous/[id]/payment-confirmation - Upload payment confirmation file
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await requirePermission('f3_upload_payment')
    if (auth instanceof NextResponse) return auth
    const supabase = getSupabaseRouteClient()
    const { id: mouId } = params
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const exchangeRate = formData.get('exchange_rate') as string | null
    const transferDate = formData.get('transfer_date') as string | null
    const projectId = formData.get('project_id') as string | null
    
    // Get current MOU to read existing payment confirmations
    const { data: mou, error: mouError } = await supabase
      .from('mous')
      .select('payment_confirmation_file')
      .eq('id', mouId)
      .single()

    if (mouError) {
      console.error('Error fetching MOU:', mouError)
      return NextResponse.json(
        { error: 'Failed to fetch MOU' },
        { status: 500 }
      )
    }

    // Parse existing payment confirmations (handle both JSON and old format)
    let confirmations: Record<string, { file_path: string; exchange_rate?: number; transfer_date?: string }> = {}
    if (mou.payment_confirmation_file) {
      try {
        const parsed = JSON.parse(mou.payment_confirmation_file)
        if (typeof parsed === 'object' && parsed !== null) {
          confirmations = parsed
        }
      } catch {
        // Old format - single file path string
        // We'll migrate it when a project_id is provided
      }
    }

    let filePath: string | null = null

    // If file is provided, upload it
    if (file) {
      if (!projectId) {
        return NextResponse.json(
          { error: 'project_id is required when uploading a file' },
          { status: 400 }
        )
      }

      // Upload file to storage with project-specific name
      const fileExt = file.name.split('.').pop()
      const fileName = `${mouId}-${projectId}-payment.${fileExt}`
      filePath = `f3-mous/${mouId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })

      if (uploadError) {
        console.error('Error uploading file:', uploadError)
        return NextResponse.json(
          { error: 'Failed to upload file' },
          { status: 500 }
        )
      }
    }

    // Update confirmations object for this project
    if (projectId) {
      if (!confirmations[projectId]) {
        confirmations[projectId] = { file_path: '' }
      }
      
      if (filePath) {
        confirmations[projectId].file_path = filePath
      }
      if (exchangeRate) {
        confirmations[projectId].exchange_rate = parseFloat(exchangeRate)
      }
      if (transferDate) {
        confirmations[projectId].transfer_date = transferDate
      }
      
      // If no file was uploaded but we have existing data, keep the existing file_path
      if (!filePath && confirmations[projectId].file_path) {
        filePath = confirmations[projectId].file_path
      }
    } else {
      // Backward compatibility: if no project_id, use old format
      // This handles the case where someone uses the old API
      if (!filePath && file) {
        const fileExt = file.name.split('.').pop()
        const fileName = `${mouId}-payment.${fileExt}`
        filePath = `f3-mous/${mouId}/${fileName}`
        
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, file, {
            cacheControl: '3600',
            upsert: true
          })

        if (uploadError) {
          console.error('Error uploading file:', uploadError)
          return NextResponse.json(
            { error: 'Failed to upload file' },
            { status: 500 }
          )
        }
      }
    }

    // Prepare update object
    const updateData: any = {}
    
    if (projectId) {
      // New format: store as JSON
      updateData.payment_confirmation_file = JSON.stringify(confirmations)
    } else if (filePath) {
      // Old format: single file path (backward compatibility)
      updateData.payment_confirmation_file = filePath
      if (exchangeRate) {
        updateData.exchange_rate = parseFloat(exchangeRate)
      }
      if (transferDate) {
        updateData.transfer_date = transferDate
      }
    } else if (!projectId) {
      return NextResponse.json(
        { error: 'No file or project_id provided' },
        { status: 400 }
      )
    }

    // Update MOU record
    const { error: updateError } = await supabase
      .from('mous')
      .update(updateData)
      .eq('id', mouId)

    if (updateError) {
      console.error('Error updating MOU:', updateError)
      return NextResponse.json(
        { error: 'Failed to update MOU' },
        { status: 500 }
      )
    }

    return NextResponse.json({ 
      success: true, 
      file_path: filePath || confirmations[projectId || '']?.file_path || null 
    })
  } catch (error) {
    console.error('Error handling payment confirmation:', error)
    return NextResponse.json(
      { error: 'Failed to handle payment confirmation' },
      { status: 500 }
    )
  }
}
