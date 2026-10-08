import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  assertMouInGrantAccess,
  assertProjectInGrantAccess,
  isProjectIdInMouScope,
} from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'
import {
  coordinatorWriteForbiddenResponse,
  getUserOrgScope,
  isDisclosedCoordinator,
} from '@/lib/canvas/orgScope'

type RouteContext = {
  params: { id: string; confirmationId: string; fileId: string }
}

/**
 * DELETE /api/f3/mous/[id]/payment-confirmation/[confirmationId]/files/[fileId]
 * Remove one file (storage + row). Does not delete the confirmation.
 */
export async function DELETE(request: Request, { params }: RouteContext) {
  try {
    if (isDisclosedCoordinator(await getUserOrgScope())) return coordinatorWriteForbiddenResponse()

    const supabase = getSupabaseRouteClient()
    const { id: mouId, confirmationId, fileId } = params

    const mouScope = await assertMouInGrantAccess(mouId)
    if (!mouScope.ok) return mouScope.response

    const { data: confirmation, error: confError } = await supabase
      .from('mou_payment_confirmations')
      .select('id, project_id')
      .eq('id', confirmationId)
      .eq('mou_id', mouId)
      .maybeSingle()

    if (confError) {
      console.error('[payment-confirmation file DELETE] confirmation', confError)
      return NextResponse.json({ error: 'Failed to load confirmation' }, { status: 500 })
    }
    if (!confirmation) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    if (!isProjectIdInMouScope(mouScope.inScopeProjectIds, confirmation.project_id)) {
      return NextResponse.json({ error: 'Payment confirmation not found' }, { status: 404 })
    }

    const projectScope = await assertProjectInGrantAccess(
      String(confirmation.project_id),
      mouScope.access
    )
    if (!projectScope.ok) return projectScope.response

    const { data: file, error: fetchError } = await supabase
      .from('mou_payment_files')
      .select('id, file_path, payment_confirmation_id, original_name')
      .eq('id', fileId)
      .eq('payment_confirmation_id', confirmationId)
      .maybeSingle()

    if (fetchError) {
      console.error('[payment-confirmation file DELETE] fetch', fetchError)
      return NextResponse.json({ error: 'Failed to load file' }, { status: 500 })
    }
    if (!file) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const { error: deleteError } = await supabase
      .from('mou_payment_files')
      .delete()
      .eq('id', fileId)
      .eq('payment_confirmation_id', confirmationId)

    if (deleteError) {
      console.error('[payment-confirmation file DELETE]', deleteError)
      return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
    }

    await emitF123Audit({
      action: 'f3.payment_file_removed',
      endpoint: 'DELETE /api/f3/mous/[id]/payment-confirmation/[confirmationId]/files/[fileId]',
      request,
      targetType: 'payment_file',
      targetId: fileId,
      oldValues: {
        payment_confirmation_id: file.payment_confirmation_id ?? confirmationId,
        file_path: file.file_path ?? null,
        original_name: file.original_name ?? null,
      },
      metadata: {
        mou_id: mouId,
        project_id: confirmation.project_id ?? null,
        payment_confirmation_id: confirmationId,
      },
    })

    if (file.file_path) {
      try {
        await supabase.storage.from('images').remove([file.file_path])
      } catch (e) {
        console.warn('[payment-confirmation file DELETE] storage remove failed', e)
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[payment-confirmation file DELETE]', error)
    return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 })
  }
}
