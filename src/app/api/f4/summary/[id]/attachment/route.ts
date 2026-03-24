import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

const ALLOWED_TYPES = ['receipt', 'proof_of_payment']
const SAFE_EXT = /^[a-z0-9]{1,6}$/

/**
 * POST /api/f4/summary/[id]/attachment
 * Upload receipt or proof of payment for an F4 summary.
 * FormData: file (required), file_type = receipt | proof_of_payment.
 * Requires f4_review permission.
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const perm = await requirePermission('f4_review')
    if (perm instanceof NextResponse) return perm

    const supabase = getSupabaseRouteClient()
    const summaryId = Number(params.id)
    if (!summaryId) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const fileType = (formData.get('file_type') as string)?.toLowerCase()
    if (!file || !fileType || !ALLOWED_TYPES.includes(fileType)) {
      return NextResponse.json(
        { error: 'file and file_type (receipt or proof_of_payment) required' },
        { status: 400 }
      )
    }

    const ext = (file.name.split('.').pop() || 'pdf').toLowerCase().replace(/[^a-z0-9]/g, '')
    if (!ext || !SAFE_EXT.test(ext)) {
      return NextResponse.json({ error: 'Invalid file extension' }, { status: 400 })
    }

    const filePath = `f4-financial-reports/summary/${summaryId}/${fileType}_${Date.now()}.${ext}`

    const { error: uploadError } = await supabase.storage
      .from('images')
      .upload(filePath, file, { cacheControl: '3600', upsert: true })

    if (uploadError) {
      console.error('F4 attachment upload error', uploadError)
      return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 })
    }

    const { data: row, error: insertError } = await supabase
      .from('err_summary_attachments')
      .insert({ summary_id: summaryId, file_key: filePath, file_type: fileType })
      .select('id, file_key, file_type')
      .single()

    if (insertError) throw insertError
    return NextResponse.json({ success: true, attachment: row })
  } catch (e) {
    console.error('F4 attachment POST error', e)
    return NextResponse.json({ error: 'Failed to save attachment' }, { status: 500 })
  }
}
