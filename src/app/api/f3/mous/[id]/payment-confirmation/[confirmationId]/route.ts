import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  assertMouInGrantAccess,
  assertProjectInGrantAccess,
  isProjectIdInMouScope,
} from '@/lib/userGrantAccess'
import { emitF123Audit, pickChangedAuditFields } from '@/lib/f123Audit'
import { getPaymentBlockedProjectIds } from '@/lib/compliance'

type RouteContext = { params: { id: string; confirmationId: string } }

const PAYMENT_CONFIRMATION_AUDIT_KEYS = [
  'exchange_rate',
  'transfer_date',
  'fsp_id',
] as const

function normalizeRate(value: unknown): number | null {
  if (value == null || value === '') return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

/**
 * PATCH /api/f3/mous/[id]/payment-confirmation/[confirmationId]
 * Update exchange_rate / transfer_date / fsp_id on an existing confirmation.
 */
export async function PATCH(request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: mouId, confirmationId } = params
    const body = await request.json().catch(() => ({}))

    const mouScope = await assertMouInGrantAccess(mouId)
    if (!mouScope.ok) return mouScope.response

    let { data: existing, error: fetchError } = await supabase
      .from('mou_payment_confirmations')
      .select('id, mou_id, project_id, exchange_rate, transfer_date, fsp_id')
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .maybeSingle()

    if (fetchError && /fsp_id/i.test(fetchError.message || '')) {
      const retry = await supabase
        .from('mou_payment_confirmations')
        .select('id, mou_id, project_id, exchange_rate, transfer_date')
        .eq('id', confirmationId)
        .eq('mou_id', mouId)
        .maybeSingle()
      existing = retry.data ? { ...retry.data, fsp_id: null } : retry.data
      fetchError = retry.error
    }

    if (fetchError) {
      console.error('[payment-confirmation PATCH] fetch', fetchError)
      return NextResponse.json({ error: 'Failed to load confirmation' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    if (!isProjectIdInMouScope(mouScope.inScopeProjectIds, existing.project_id)) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    const projectScope = await assertProjectInGrantAccess(
      String(existing.project_id),
      mouScope.access
    )
    if (!projectScope.ok) return projectScope.response

    const paymentBlocked = await getPaymentBlockedProjectIds(supabase, [String(existing.project_id)])
    if (paymentBlocked.length > 0) {
      return NextResponse.json(
        {
          error: 'Compliance screening is not cleared for this F1. Payment cannot be recorded yet.',
          code: 'COMPLIANCE_PAYMENT_BLOCKED',
        },
        { status: 400 }
      )
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
    if ('fsp_id' in body) {
      const raw = body.fsp_id
      update.fsp_id =
        raw == null || raw === '' || raw === '__none__' ? null : String(raw)
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    let { data, error } = await supabase
      .from('mou_payment_confirmations')
      .update(update)
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .select(
        'id, mou_id, project_id, exchange_rate, transfer_date, fsp_id, created_by, created_at, updated_at'
      )
      .single()

    if (error && /fsp_id/i.test(error.message || '')) {
      const withoutFsp = { ...update }
      delete withoutFsp.fsp_id
      if (Object.keys(withoutFsp).length === 0) {
        return NextResponse.json(
          {
            error:
              'FSP cannot be saved until sql/add_payment_confirmations_fsp_id.sql is applied in Supabase.',
          },
          { status: 400 }
        )
      }
      const retry = await supabase
        .from('mou_payment_confirmations')
        .update(withoutFsp)
        .eq('id', confirmationId)
        .eq('mou_id', mouId)
        .select(
          'id, mou_id, project_id, exchange_rate, transfer_date, created_by, created_at, updated_at'
        )
        .single()
      data = retry.data ? { ...retry.data, fsp_id: null } : retry.data
      error = retry.error
    }

    if (error || !data) {
      console.error('[payment-confirmation PATCH]', error)
      return NextResponse.json({ error: 'Failed to update confirmation' }, { status: 500 })
    }

    const confirmationChanges = pickChangedAuditFields(
      {
        exchange_rate: normalizeRate(existing.exchange_rate),
        transfer_date: existing.transfer_date ?? null,
        fsp_id: existing.fsp_id ?? null,
      },
      {
        exchange_rate: normalizeRate(data.exchange_rate),
        transfer_date: data.transfer_date ?? null,
        fsp_id: data.fsp_id ?? null,
      },
      PAYMENT_CONFIRMATION_AUDIT_KEYS
    )
    if (confirmationChanges) {
      await emitF123Audit({
        action: 'f3.payment_confirmation_updated',
        endpoint: 'PATCH /api/f3/mous/[id]/payment-confirmation/[confirmationId]',
        request,
        targetType: 'payment_confirmation',
        targetId: confirmationId,
        oldValues: confirmationChanges.oldValues,
        newValues: confirmationChanges.newValues,
        metadata: {
          mou_id: mouId,
          project_id: existing.project_id ?? null,
          updated_fields: Object.keys(confirmationChanges.newValues),
        },
      })
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
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: mouId, confirmationId } = params

    const mouScope = await assertMouInGrantAccess(mouId)
    if (!mouScope.ok) return mouScope.response

    let { data: existing, error: fetchError } = await supabase
      .from('mou_payment_confirmations')
      .select('id, mou_id, project_id, exchange_rate, transfer_date, fsp_id')
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .maybeSingle()

    if (fetchError && /fsp_id/i.test(fetchError.message || '')) {
      const retry = await supabase
        .from('mou_payment_confirmations')
        .select('id, mou_id, project_id, exchange_rate, transfer_date')
        .eq('id', confirmationId)
        .eq('mou_id', mouId)
        .maybeSingle()
      existing = retry.data ? { ...retry.data, fsp_id: null } : retry.data
      fetchError = retry.error
    }

    if (fetchError) {
      console.error('[payment-confirmation DELETE] fetch', fetchError)
      return NextResponse.json({ error: 'Failed to load confirmation' }, { status: 500 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    if (!isProjectIdInMouScope(mouScope.inScopeProjectIds, existing.project_id)) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    const projectScope = await assertProjectInGrantAccess(
      String(existing.project_id),
      mouScope.access
    )
    if (!projectScope.ok) return projectScope.response

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

    await emitF123Audit({
      action: 'f3.payment_confirmation_deleted',
      endpoint: 'DELETE /api/f3/mous/[id]/payment-confirmation/[confirmationId]',
      request,
      targetType: 'payment_confirmation',
      targetId: confirmationId,
      oldValues: {
        mou_id: existing.mou_id ?? mouId,
        project_id: existing.project_id ?? null,
        exchange_rate: normalizeRate(existing.exchange_rate),
        transfer_date: existing.transfer_date ?? null,
        fsp_id: existing.fsp_id ?? null,
      },
      metadata: {
        mou_id: mouId,
        project_id: existing.project_id ?? null,
        file_count: paths.length,
      },
    })

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
