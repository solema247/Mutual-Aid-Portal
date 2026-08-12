import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  buildPaymentFileStoragePath,
  getSessionUserLabel,
} from '@/lib/mouPaymentConfirmations'

type RouteContext = { params: { id: string; confirmationId: string } }

/**
 * POST /api/f3/mous/[id]/payment-confirmation/[confirmationId]/files
 * Add one or more files to an existing payment confirmation.
 * FormData: file and/or files[]
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: mouId, confirmationId } = params
    const formData = await request.formData()

    const { data: confirmation, error: fetchError } = await supabase
      .from('mou_payment_confirmations')
      .select('id, mou_id, project_id')
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .maybeSingle()

    if (fetchError) {
      console.error('[payment-confirmation files POST] fetch', fetchError)
      return NextResponse.json({ error: 'Failed to load confirmation' }, { status: 500 })
    }
    if (!confirmation) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    const files: File[] = []
    const single = formData.get('file')
    if (single instanceof File && single.size > 0) files.push(single)
    for (const value of formData.getAll('files')) {
      if (value instanceof File && value.size > 0) files.push(value)
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const uploadedBy = await getSessionUserLabel(supabase)
    const uploaded = []

    for (const file of files) {
      const filePath = buildPaymentFileStoragePath({
        mouId,
        projectId: confirmation.project_id,
        confirmationId,
        originalName: file.name,
      })

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false,
        })

      if (uploadError) {
        console.error('[payment-confirmation files POST] upload', uploadError)
        return NextResponse.json(
          { error: uploadError.message || 'Failed to upload file' },
          { status: 500 }
        )
      }

      const { data: fileRow, error: fileError } = await supabase
        .from('mou_payment_files')
        .insert({
          payment_confirmation_id: confirmationId,
          file_path: filePath,
          original_name: file.name,
          file_type: file.type || null,
          file_size: file.size ?? null,
          uploaded_by: uploadedBy,
        })
        .select(
          'id, payment_confirmation_id, file_path, original_name, file_type, file_size, uploaded_by, uploaded_at'
        )
        .single()

      if (fileError) {
        try {
          await supabase.storage.from('images').remove([filePath])
        } catch {
          // ignore
        }
        console.error('[payment-confirmation files POST] insert', fileError)
        return NextResponse.json(
          { error: fileError.message || 'Failed to save file record' },
          { status: 500 }
        )
      }

      uploaded.push(fileRow)
    }

    return NextResponse.json({ success: true, files: uploaded })
  } catch (error) {
    console.error('[payment-confirmation files POST]', error)
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
  }
}
