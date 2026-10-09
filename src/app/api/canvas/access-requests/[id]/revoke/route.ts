import { NextRequest, NextResponse } from 'next/server'
import { requireCanvasSession, isCanvasAdmin } from '@/lib/canvas/session'
import {
  emitAccessRequestAudit,
  isProcessorOrg,
  normalizeResourceType,
} from '@/lib/canvas/disclosure'

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /does not exist/i.test(error.message ?? '')
}

/**
 * Host org withdraws a previously approved grant.
 * Deletes matching access_grants and marks the request revoked when the DB allows it.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { canvas, supabase, user } = session
  const { id } = params

  if (canvas.is_fallback || !canvas.organization.id) {
    return NextResponse.json(
      { error: 'Disclosure features unavailable', code: 'DISCLOSURE_UNAVAILABLE' },
      { status: 503 }
    )
  }

  if (!isProcessorOrg(canvas.organization)) {
    return NextResponse.json(
      { error: 'Only host organizations can revoke access' },
      { status: 403 }
    )
  }

  if (!isCanvasAdmin(user.role)) {
    return NextResponse.json(
      { error: 'Admin role required to revoke access' },
      { status: 403 }
    )
  }

  let body: { decision_note?: string } = {}
  try {
    body = await request.json()
  } catch {
    body = {}
  }

  const note =
    typeof body.decision_note === 'string' ? body.decision_note.trim() : ''
  if (!note) {
    return NextResponse.json(
      { error: 'A reason is required when revoking access' },
      { status: 400 }
    )
  }

  const { data: existing, error: fetchErr } = await supabase
    .from('access_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (fetchErr) {
    if (tableMissing(fetchErr)) {
      return NextResponse.json(
        { error: 'Disclosure features unavailable', code: 'DISCLOSURE_UNAVAILABLE' },
        { status: 503 }
      )
    }
    return NextResponse.json({ error: 'Failed to load request' }, { status: 500 })
  }

  if (!existing) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  if (existing.target_organization_id !== canvas.organization.id) {
    return NextResponse.json({ error: 'Forbidden — not your inbox' }, { status: 403 })
  }

  if (existing.status === 'revoked') {
    return NextResponse.json({ error: 'Access already revoked', request: existing }, { status: 409 })
  }

  if (existing.status !== 'approved') {
    return NextResponse.json(
      { error: 'Only approved access can be revoked' },
      { status: 400 }
    )
  }

  const resourceType =
    normalizeResourceType(existing.resource_type) ?? existing.resource_type
  const now = new Date().toISOString()

  // Remove live grant(s) — this is what stops coordinator access.
  let grantDelete = supabase
    .from('access_grants')
    .delete()
    .eq('requesting_organization_id', existing.requesting_organization_id)
    .eq('target_organization_id', existing.target_organization_id)
    .eq('resource_type', resourceType)

  if (existing.resource_id) {
    grantDelete = grantDelete.eq('resource_id', existing.resource_id)
  } else {
    grantDelete = grantDelete.is('resource_id', null)
  }

  const { error: grantErr } = await grantDelete
  if (grantErr) {
    if (tableMissing(grantErr)) {
      return NextResponse.json(
        { error: 'Disclosure features unavailable', code: 'DISCLOSURE_UNAVAILABLE' },
        { status: 503 }
      )
    }
    console.error('revoke access_grants delete', grantErr)
    return NextResponse.json({ error: 'Failed to revoke access grant' }, { status: 500 })
  }

  // Also clear legacy err_project type grant when revoking f1
  if (!existing.resource_id && resourceType === 'f1') {
    await supabase
      .from('access_grants')
      .delete()
      .eq('requesting_organization_id', existing.requesting_organization_id)
      .eq('target_organization_id', existing.target_organization_id)
      .eq('resource_type', 'err_project')
      .is('resource_id', null)
  }

  const nextNote = existing.decision_note
    ? `${existing.decision_note}\n[Revoked] ${note}`
    : note

  const { data: updated, error: updateErr } = await supabase
    .from('access_requests')
    .update({
      status: 'revoked',
      decided_by: user.id,
      decided_at: now,
      decision_note: nextNote,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr || !updated) {
    // Grants already deleted — status enum may lack 'revoked' until 007 is applied.
    console.warn('revoke status update failed (apply sql/canvas/007?):', updateErr?.message)
    const { data: fallbackRow } = await supabase
      .from('access_requests')
      .update({
        decision_note: nextNote,
        updated_at: now,
      })
      .eq('id', id)
      .select('*')
      .single()

    await emitAccessRequestAudit({
      action: 'access_request.revoked',
      actorUserId: user.id,
      requestId: id,
      endpoint: 'POST /api/canvas/access-requests/[id]/revoke',
      request,
      oldValues: { status: 'approved' },
      newValues: {
        status: fallbackRow?.status ?? 'approved',
        grant_removed: true,
        decision_note: nextNote,
      },
    })

    return NextResponse.json({
      request: fallbackRow ?? existing,
      grant_removed: true,
      status_update_pending_sql: true,
      hint: 'Apply sql/canvas/007_access_request_revoked.sql so status can be set to revoked',
    })
  }

  await emitAccessRequestAudit({
    action: 'access_request.revoked',
    actorUserId: user.id,
    requestId: updated.id,
    endpoint: 'POST /api/canvas/access-requests/[id]/revoke',
    request,
    oldValues: { status: 'approved' },
    newValues: {
      status: 'revoked',
      decided_by: user.id,
      resource_type: existing.resource_type,
      states: existing.states ?? null,
    },
  })

  return NextResponse.json({ request: updated, grant_removed: true })
}
