import { NextRequest, NextResponse } from 'next/server'
import { requireCanvasSession, isCanvasAdmin } from '@/lib/canvas/session'
import {
  emitAccessRequestAudit,
  formatStatesLabel,
  getDisclosurePolicy,
  INFO_RESOURCE_TYPE_LABELS,
  isCoordinatorOrg,
  isInfoResourceType,
  isProcessorOrg,
  normalizeResourceType,
  normalizeStatesInput,
} from '@/lib/canvas/disclosure'

function tableMissing(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42P01' || /does not exist/i.test(error.message ?? '')
}

export async function GET() {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { canvas, supabase, user } = session

  if (canvas.is_fallback || !canvas.organization.id) {
    return NextResponse.json({
      requests: [],
      canvas_is_fallback: true,
      disclosure_unavailable: true,
    })
  }

  const orgId = canvas.organization.id
  let query = supabase
    .from('access_requests')
    .select(
      `
      id,
      requesting_organization_id,
      target_organization_id,
      requested_by,
      resource_type,
      resource_id,
      scope,
      states,
      reason,
      status,
      decided_by,
      decided_at,
      decision_note,
      created_at,
      updated_at
    `
    )
    .order('created_at', { ascending: false })
    .limit(200)

  if (isCoordinatorOrg(canvas.organization)) {
    query = query.eq('requesting_organization_id', orgId)
  } else if (isProcessorOrg(canvas.organization)) {
    query = query.eq('target_organization_id', orgId)
  } else {
    return NextResponse.json({ requests: [], canvas_is_fallback: false })
  }

  const { data, error } = await query
  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json({
        requests: [],
        disclosure_unavailable: true,
      })
    }
    console.error('GET access-requests', error)
    return NextResponse.json(
      {
        error:
          error.message?.includes('states')
            ? 'Apply sql/canvas/005_info_type_disclosure.sql (states column missing)'
            : 'Failed to load access requests',
      },
      { status: 500 }
    )
  }

  const orgIds = new Set<string>()
  for (const r of data ?? []) {
    orgIds.add(r.requesting_organization_id)
    orgIds.add(r.target_organization_id)
  }

  const orgNameById = new Map<string, string>()
  if (orgIds.size > 0) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', Array.from(orgIds))
    for (const o of orgs ?? []) orgNameById.set(o.id, o.name)
  }

  const requests = (data ?? []).map((r) => {
    const norm = normalizeResourceType(r.resource_type)
    return {
      ...r,
      requesting_org_name: orgNameById.get(r.requesting_organization_id) ?? null,
      target_org_name: orgNameById.get(r.target_organization_id) ?? null,
      resource_type_label: norm
        ? INFO_RESOURCE_TYPE_LABELS[norm]
        : r.resource_type,
      states_label: formatStatesLabel(r.states ?? null),
      can_decide:
        isProcessorOrg(canvas.organization) &&
        r.status === 'pending' &&
        isCanvasAdmin(user.role),
    }
  })

  return NextResponse.json({ requests, canvas_is_fallback: false })
}

export async function POST(request: NextRequest) {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { canvas, supabase, user } = session

  if (canvas.is_fallback || !canvas.organization.id) {
    return NextResponse.json(
      { error: 'Disclosure features unavailable', code: 'DISCLOSURE_UNAVAILABLE' },
      { status: 503 }
    )
  }

  if (!isCoordinatorOrg(canvas.organization)) {
    return NextResponse.json(
      { error: 'Only coordinator organizations can create access requests' },
      { status: 403 }
    )
  }

  let body: {
    resource_type?: string
    target_organization_id?: string
    states?: string[] | null
    reason?: string
    scope?: string
    resource_id?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  // Soft-reject legacy per-record creates
  if (body.scope === 'record' || body.resource_id) {
    return NextResponse.json(
      {
        error:
          'Per-project access requests are retired. Request an information type (e.g. F1) for all or selected states.',
        code: 'RECORD_SCOPE_DEPRECATED',
      },
      { status: 400 }
    )
  }

  const rawType = typeof body.resource_type === 'string' ? body.resource_type.trim() : ''
  if (!isInfoResourceType(rawType)) {
    return NextResponse.json(
      { error: 'resource_type must be one of f1, decisions, fund_requests, mous, f4, f5' },
      { status: 400 }
    )
  }

  const targetOrgId =
    typeof body.target_organization_id === 'string'
      ? body.target_organization_id.trim()
      : ''
  if (!targetOrgId) {
    return NextResponse.json({ error: 'target_organization_id required' }, { status: 400 })
  }

  const { data: targetOrg } = await supabase
    .from('organizations')
    .select('id, org_type')
    .eq('id', targetOrgId)
    .maybeSingle()

  if (!targetOrg || targetOrg.org_type !== 'processor') {
    return NextResponse.json({ error: 'Target must be a host organization' }, { status: 400 })
  }

  const policy = await getDisclosurePolicy(supabase, targetOrgId, rawType)
  if (policy && policy.advertise_existence === false) {
    return NextResponse.json(
      { error: 'This information type is not advertised for access requests' },
      { status: 403 }
    )
  }

  const states = normalizeStatesInput(body.states)

  const { data: existing } = await supabase
    .from('access_requests')
    .select('id')
    .eq('requesting_organization_id', canvas.organization.id)
    .eq('target_organization_id', targetOrgId)
    .eq('resource_type', rawType)
    .eq('scope', 'org_resource_type')
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'A pending request already exists for this type', request: existing },
      { status: 409 }
    )
  }

  const insert = {
    requesting_organization_id: canvas.organization.id,
    target_organization_id: targetOrgId,
    requested_by: user.id,
    resource_type: rawType,
    resource_id: null,
    scope: 'org_resource_type',
    states,
    reason: typeof body.reason === 'string' ? body.reason.trim() || null : null,
    status: 'pending',
  }

  const { data: created, error } = await supabase
    .from('access_requests')
    .insert(insert)
    .select('*')
    .single()

  if (error) {
    if (tableMissing(error)) {
      return NextResponse.json(
        { error: 'Disclosure features unavailable', code: 'DISCLOSURE_UNAVAILABLE' },
        { status: 503 }
      )
    }
    console.error('POST access-requests', error)
    const needs005 =
      error.code === 'PGRST204' ||
      /states/i.test(error.message ?? '') ||
      /resource_type/i.test(error.message ?? '')
    return NextResponse.json(
      {
        error: needs005
          ? 'Database is missing info-type columns. Apply sql/canvas/005_info_type_disclosure.sql on production, then retry.'
          : 'Failed to create request',
        code: needs005 ? 'APPLY_005' : 'CREATE_FAILED',
      },
      { status: 500 }
    )
  }

  await emitAccessRequestAudit({
    action: 'access_request.created',
    actorUserId: user.id,
    requestId: created.id,
    endpoint: 'POST /api/canvas/access-requests',
    request,
    newValues: {
      status: 'pending',
      scope: 'org_resource_type',
      resource_type: rawType,
      states,
      target_organization_id: targetOrgId,
    },
  })

  return NextResponse.json({ request: created }, { status: 201 })
}
