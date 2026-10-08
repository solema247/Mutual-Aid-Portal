import { NextRequest, NextResponse } from 'next/server'
import { requireCanvasSession, isCanvasAdmin } from '@/lib/canvas/session'
import {
  emitAccessRequestAudit,
  isProcessorOrg,
} from '@/lib/canvas/disclosure'

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /does not exist/i.test(error.message ?? '')
}

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
      { error: 'Only processor organizations can decide access requests' },
      { status: 403 }
    )
  }

  if (!isCanvasAdmin(user.role)) {
    return NextResponse.json(
      { error: 'Admin role required to approve or deny' },
      { status: 403 }
    )
  }

  let body: { decision?: string; decision_note?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const decision = body.decision === 'approved' || body.decision === 'denied' ? body.decision : null
  if (!decision) {
    return NextResponse.json({ error: 'decision must be approved or denied' }, { status: 400 })
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

  if (existing.status !== 'pending') {
    return NextResponse.json(
      { error: 'Request already decided', request: existing },
      { status: 409 }
    )
  }

  const now = new Date().toISOString()
  const { data: updated, error: updateErr } = await supabase
    .from('access_requests')
    .update({
      status: decision,
      decided_by: user.id,
      decided_at: now,
      decision_note:
        typeof body.decision_note === 'string' ? body.decision_note.trim() || null : null,
      updated_at: now,
    })
    .eq('id', id)
    .select('*')
    .single()

  if (updateErr || !updated) {
    console.error('decide access-request update', updateErr)
    return NextResponse.json({ error: 'Failed to update request' }, { status: 500 })
  }

  if (decision === 'approved') {
    if (existing.scope === 'record' && existing.resource_id) {
      const { error: grantErr } = await supabase.from('access_grants').upsert(
        {
          requesting_organization_id: existing.requesting_organization_id,
          target_organization_id: existing.target_organization_id,
          resource_type: existing.resource_type,
          resource_id: existing.resource_id,
          access_request_id: existing.id,
          granted_by: user.id,
          granted_at: now,
        },
        {
          onConflict:
            'requesting_organization_id,target_organization_id,resource_type,resource_id',
        }
      )
      if (grantErr) {
        console.error('access_grants upsert', grantErr)
        return NextResponse.json(
          { error: 'Approved but failed to create access grant', request: updated },
          { status: 500 }
        )
      }
    } else if (existing.scope === 'org_resource_type') {
      const { error: policyErr } = await supabase
        .from('disclosure_policies')
        .upsert(
          {
            organization_id: existing.target_organization_id,
            resource_type: existing.resource_type,
            advertise_existence: true,
            disclose_content: true,
            updated_at: now,
          },
          { onConflict: 'organization_id,resource_type' }
        )
      if (policyErr) {
        console.error('disclosure_policies upsert', policyErr)
        return NextResponse.json(
          { error: 'Approved but failed to update disclosure policy', request: updated },
          { status: 500 }
        )
      }
    }
  }

  await emitAccessRequestAudit({
    action: 'access_request.decided',
    actorUserId: user.id,
    requestId: updated.id,
    endpoint: 'POST /api/canvas/access-requests/[id]/decide',
    request,
    oldValues: { status: 'pending' },
    newValues: {
      status: decision,
      decided_by: user.id,
      scope: existing.scope,
      resource_id: existing.resource_id,
    },
  })

  return NextResponse.json({ request: updated })
}
