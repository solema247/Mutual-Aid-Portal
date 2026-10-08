import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  buildPaymentFileStoragePath,
  getSessionUserLabel,
  listPaymentConfirmationsForMou,
} from '@/lib/mouPaymentConfirmations'
import {
  assertMouInGrantAccess,
  assertProjectInGrantAccess,
  isProjectIdInMouScope,
} from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'
import { getPaymentBlockedProjectIds } from '@/lib/compliance'
import {
  coordinatorWriteForbiddenResponse,
  getUserOrgScope,
  isDisclosedCoordinator,
} from '@/lib/canvas/orgScope'

type RouteContext = { params: { id: string } }

async function uploadPaymentFile(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  opts: {
    mouId: string
    projectId: string
    confirmationId: string
    file: File
    uploadedBy: string | null
  }
) {
  const filePath = buildPaymentFileStoragePath({
    mouId: opts.mouId,
    projectId: opts.projectId,
    confirmationId: opts.confirmationId,
    originalName: opts.file.name,
  })

  const { error: uploadError } = await supabase.storage
    .from('images')
    .upload(filePath, opts.file, {
      cacheControl: '3600',
      upsert: false,
    })

  if (uploadError) {
    throw new Error(uploadError.message || 'Failed to upload file')
  }

  const { data: fileRow, error: fileError } = await supabase
    .from('mou_payment_files')
    .insert({
      payment_confirmation_id: opts.confirmationId,
      file_path: filePath,
      original_name: opts.file.name,
      file_type: opts.file.type || null,
      file_size: opts.file.size ?? null,
      uploaded_by: opts.uploadedBy,
    })
    .select(
      'id, payment_confirmation_id, file_path, original_name, file_type, file_size, uploaded_by, uploaded_at'
    )
    .single()

  if (fileError) {
    try {
      await supabase.storage.from('images').remove([filePath])
    } catch {
      // best-effort cleanup
    }
    throw new Error(fileError.message || 'Failed to save file record')
  }

  return fileRow
}

/**
 * GET /api/f3/mous/[id]/payment-confirmation?project_id=
 * List payment confirmations (+ files) for an MOU, optionally filtered by project.
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    const supabase = getSupabaseRouteClient()
    const mouId = params.id
    const { searchParams } = new URL(request.url)
    const projectId = searchParams.get('project_id')

    const mouScope = await assertMouInGrantAccess(mouId)
    if (!mouScope.ok) return mouScope.response

    if (projectId) {
      const projectScope = await assertProjectInGrantAccess(projectId, mouScope.access)
      if (!projectScope.ok) return projectScope.response
      if (
        mouScope.inScopeProjectIds &&
        !mouScope.inScopeProjectIds.includes(projectId)
      ) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 })
      }
    }

    const confirmations = await listPaymentConfirmationsForMou(supabase, mouId, projectId)

    const inScopeSet =
      mouScope.inScopeProjectIds == null
        ? null
        : new Set(mouScope.inScopeProjectIds)

    const scopedConfirmations =
      inScopeSet == null
        ? confirmations
        : confirmations.filter((c) => inScopeSet.has(c.project_id))

    if (projectId) {
      return NextResponse.json({
        project_id: projectId,
        payment_confirmations: scopedConfirmations,
      })
    }

    const byProject: Record<string, typeof scopedConfirmations> = {}
    for (const c of scopedConfirmations) {
      if (!byProject[c.project_id]) byProject[c.project_id] = []
      byProject[c.project_id].push(c)
    }

    let mouProjectQuery = supabase.from('err_projects').select('id').eq('mou_id', mouId)
    if (mouScope.inScopeProjectIds != null) {
      mouProjectQuery = mouProjectQuery.in('id', mouScope.inScopeProjectIds)
    }
    const { data: mouProjects } = await mouProjectQuery
    const paymentBlockedProjectIds = await getPaymentBlockedProjectIds(
      supabase,
      (mouProjects || []).map((p) => String(p.id))
    )

    return NextResponse.json({
      mou_id: mouId,
      by_project: byProject,
      payment_confirmations: scopedConfirmations,
      payment_blocked_project_ids: paymentBlockedProjectIds,
    })
  } catch (error) {
    console.error('[payment-confirmation GET]', error)
    return NextResponse.json(
      { error: 'Failed to list payment confirmations' },
      { status: 500 }
    )
  }
}

/**
 * POST /api/f3/mous/[id]/payment-confirmation
 * Create a NEW payment confirmation for a project (does not replace existing).
 * FormData: project_id (required), exchange_rate?, transfer_date?, file? or files[]
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    if (isDisclosedCoordinator(await getUserOrgScope())) return coordinatorWriteForbiddenResponse()

    const supabase = getSupabaseRouteClient()
    const mouId = params.id
    const formData = await request.formData()
    const projectId = (formData.get('project_id') as string | null)?.trim() || null
    const exchangeRateRaw = formData.get('exchange_rate') as string | null
    const transferDate = (formData.get('transfer_date') as string | null)?.trim() || null
    const rawFspId = (formData.get('fsp_id') as string | null)?.trim() || null
    const fspId = !rawFspId || rawFspId === '__none__' ? null : rawFspId

    if (!projectId) {
      return NextResponse.json({ error: 'project_id is required' }, { status: 400 })
    }

    const mouScope = await assertMouInGrantAccess(mouId)
    if (!mouScope.ok) return mouScope.response

    const projectScope = await assertProjectInGrantAccess(projectId, mouScope.access)
    if (!projectScope.ok) return projectScope.response
    if (!isProjectIdInMouScope(mouScope.inScopeProjectIds, projectId)) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const { data: project, error: projectError } = await supabase
      .from('err_projects')
      .select('id, mou_id')
      .eq('id', projectId)
      .maybeSingle()

    if (projectError) {
      console.error('[payment-confirmation POST] project', projectError)
      return NextResponse.json({ error: 'Failed to fetch project' }, { status: 500 })
    }
    if (!project || project.mou_id !== mouId) {
      return NextResponse.json(
        { error: 'Project not found on this MOU' },
        { status: 400 }
      )
    }

    const paymentBlocked = await getPaymentBlockedProjectIds(supabase, [projectId])
    if (paymentBlocked.length > 0) {
      return NextResponse.json(
        {
          error: 'Compliance screening is not cleared for this F1. Payment cannot be recorded yet.',
          code: 'COMPLIANCE_PAYMENT_BLOCKED',
        },
        { status: 400 }
      )
    }

    let exchangeRate: number | null = null
    if (exchangeRateRaw != null && String(exchangeRateRaw).trim() !== '') {
      const n = parseFloat(String(exchangeRateRaw))
      if (Number.isNaN(n) || n <= 0) {
        return NextResponse.json({ error: 'Invalid exchange_rate' }, { status: 400 })
      }
      exchangeRate = n
    }

    const files: File[] = []
    const single = formData.get('file')
    if (single instanceof File && single.size > 0) files.push(single)
    for (const value of formData.getAll('files')) {
      if (value instanceof File && value.size > 0) files.push(value)
    }

    if (!exchangeRate && !transferDate && files.length === 0) {
      return NextResponse.json(
        { error: 'Provide exchange_rate, transfer_date, and/or at least one file' },
        { status: 400 }
      )
    }

    const uploadedBy = await getSessionUserLabel(supabase)

    const insertPayload: Record<string, unknown> = {
      mou_id: mouId,
      project_id: projectId,
      exchange_rate: exchangeRate,
      transfer_date: transferDate,
      created_by: uploadedBy,
    }
    if (fspId) insertPayload.fsp_id = fspId

    let { data: confirmation, error: insertError } = await supabase
      .from('mou_payment_confirmations')
      .insert(insertPayload)
      .select(
        'id, mou_id, project_id, exchange_rate, transfer_date, fsp_id, created_by, created_at, updated_at'
      )
      .single()

    if (insertError && /fsp_id/i.test(insertError.message || '')) {
      delete insertPayload.fsp_id
      const retry = await supabase
        .from('mou_payment_confirmations')
        .insert(insertPayload)
        .select(
          'id, mou_id, project_id, exchange_rate, transfer_date, created_by, created_at, updated_at'
        )
        .single()
      confirmation = retry.data
        ? { ...retry.data, fsp_id: null }
        : retry.data
      insertError = retry.error
    }

    if (insertError || !confirmation) {
      console.error('[payment-confirmation POST] insert', insertError)
      return NextResponse.json(
        { error: insertError?.message || 'Failed to create payment confirmation' },
        { status: 500 }
      )
    }

    const uploadedFiles: { id: string; file_path: string }[] = []
    for (const file of files) {
      try {
        const row = await uploadPaymentFile(supabase, {
          mouId,
          projectId,
          confirmationId: confirmation.id,
          file,
          uploadedBy,
        })
        uploadedFiles.push(row)
      } catch (e) {
        console.error('[payment-confirmation POST] file upload', e)
        // Roll back confirmation + any uploaded files if first file fails mid-way
        const paths = uploadedFiles.map((f) => f.file_path).filter(Boolean)
        if (paths.length) {
          try {
            await supabase.storage.from('images').remove(paths)
          } catch {
            // ignore
          }
        }
        await supabase.from('mou_payment_confirmations').delete().eq('id', confirmation.id)
        return NextResponse.json(
          { error: e instanceof Error ? e.message : 'Failed to upload file' },
          { status: 500 }
        )
      }
    }

    await emitF123Audit({
      action: 'f3.payment_confirmation_created',
      endpoint: 'POST /api/f3/mous/[id]/payment-confirmation',
      request,
      targetType: 'payment_confirmation',
      targetId: confirmation.id,
      newValues: {
        mou_id: mouId,
        project_id: projectId,
        exchange_rate: confirmation.exchange_rate == null ? null : Number(confirmation.exchange_rate),
        transfer_date: confirmation.transfer_date ?? null,
        fsp_id: (confirmation as { fsp_id?: string | null }).fsp_id ?? null,
      },
      metadata: {
        mou_id: mouId,
        project_id: projectId,
        file_ids: uploadedFiles.map((f) => f.id).filter(Boolean),
        file_count: uploadedFiles.length,
      },
    })

    return NextResponse.json({
      success: true,
      payment_confirmation: {
        ...confirmation,
        exchange_rate:
          confirmation.exchange_rate == null
            ? null
            : Number(confirmation.exchange_rate),
        files: uploadedFiles,
      },
    })
  } catch (error) {
    console.error('[payment-confirmation POST]', error)
    return NextResponse.json(
      { error: 'Failed to create payment confirmation' },
      { status: 500 }
    )
  }
}
