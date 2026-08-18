import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'

type RouteContext = { params: { id: string; confirmationId: string } }

/**
 * PATCH /api/f3/mous/[id]/payment-confirmation/[confirmationId]
 * Update exchange_rate / transfer_date on an existing confirmation.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: mouId, confirmationId } = params
    const body = await request.json().catch(() => ({}))

    const { data: existing, error: fetchError } = await supabase
      .from('mou_payment_confirmations')
      .select('id, mou_id')
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .maybeSingle()

    if (fetchError) {
      console.error('[payment-confirmation PATCH] fetch', fetchError)
      return NextResponse.json({ error: 'Failed to load confirmation' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    const update: Record<string, unknown> = {}
    if ('exchange_rate' in body) {
      if (body.exchange_rate == null || body.exchange_rate === '') {
        update.exchange_rate = null
      } else {
        const n = parseFloat(String(body.exchange_rate))
        if (Number.isNaN(n) || n <= 0) {
          return NextResponse.json({ error: 'Invalid exchange_rate' }, { status: 400 })
        }
        update.exchange_rate = n
      }
    }
    if ('transfer_date' in body) {
      update.transfer_date =
        body.transfer_date == null || body.transfer_date === ''
          ? null
          : String(body.transfer_date)
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('mou_payment_confirmations')
      .update(update)
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .select(
        'id, mou_id, project_id, exchange_rate, transfer_date, created_by, created_at, updated_at'
      )
      .single()

    if (error) {
      console.error('[payment-confirmation PATCH]', error)
      return NextResponse.json({ error: 'Failed to update confirmation' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      payment_confirmation: {
        ...data,
        exchange_rate: data.exchange_rate == null ? null : Number(data.exchange_rate),
      },
    })
  } catch (error) {
    console.error('[payment-confirmation PATCH]', error)
    return NextResponse.json({ error: 'Failed to update confirmation' }, { status: 500 })
  }
}

/**
 * DELETE /api/f3/mous/[id]/payment-confirmation/[confirmationId]
 * Delete confirmation + all file rows + storage objects.
 */
export async function DELETE(_request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: mouId, confirmationId } = params

    const { data: existing, error: fetchError } = await supabase
      .from('mou_payment_confirmations')
      .select('id, mou_id')
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .maybeSingle()

    if (fetchError) {
      console.error('[payment-confirmation DELETE] fetch', fetchError)
      return NextResponse.json({ error: 'Failed to load confirmation' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    const { data: files, error: filesError } = await supabase
      .from('mou_payment_files')
      .select('id, file_path')
      .eq('payment_confirmation_id', confirmationId)

    if (filesError) {
      console.error('[payment-confirmation DELETE] files', filesError)
      return NextResponse.json({ error: 'Failed to load confirmation files' }, { status: 500 })
    }

    const paths = (files || []).map((f) => f.file_path).filter(Boolean)

    const { error: deleteError } = await supabase
      .from('mou_payment_confirmations')
      .delete()
      .eq('id', confirmationId)
      .eq('mou_id', mouId)

    if (deleteError) {
      console.error('[payment-confirmation DELETE]', deleteError)
      return NextResponse.json({ error: 'Failed to delete confirmation' }, { status: 500 })
    }

    if (paths.length > 0) {
      try {
        await supabase.storage.from('images').remove(paths)
      } catch (e) {
        console.warn('[payment-confirmation DELETE] storage remove failed', e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[payment-confirmation DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete confirmation' }, { status: 500 })
  }
}
