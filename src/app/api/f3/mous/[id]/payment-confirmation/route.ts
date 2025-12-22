import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

// POST /api/f3/mous/[id]/payment-confirmation - Upload payment confirmation file
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: mouId } = params
    const formData = await request.formData()
    const file = formData.get('file') as File
    const exchangeRate = formData.get('exchange_rate') as string | null
    const transferDate = formData.get('transfer_date') as string | null
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    // Upload file to storage
    const fileExt = file.name.split('.').pop()
    const fileName = `${mouId}-payment.${fileExt}`
    const filePath = `f3-mous/${mouId}/${fileName}`

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

    // Prepare update object
    const updateData: any = { payment_confirmation_file: filePath }
    if (exchangeRate) {
      updateData.exchange_rate = parseFloat(exchangeRate)
    }
    if (transferDate) {
      updateData.transfer_date = transferDate
    }

    // Update MOU record with file path, exchange rate, and transfer date
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

    return NextResponse.json({ success: true, file_path: filePath })
  } catch (error) {
    console.error('Error handling payment confirmation:', error)
    return NextResponse.json(
      { error: 'Failed to handle payment confirmation' },
      { status: 500 }
    )
  }
}
