import { NextRequest, NextResponse } from 'next/server'
import { requireCanvasSession, isCanvasAdmin } from '@/lib/canvas/session'
import {
  emitAccessRequestAudit,
  getDisclosurePolicy,
  isCoordinatorOrg,
  isProcessorOrg,
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
    return NextResponse.json({ error: 'Failed to load access requests' }, { status: 500 })
  }

  // Enrich with org names + project stub fields where useful
  const orgIds = new Set<string>()
  const projectIds = new Set<string>()
  for (const r of data ?? []) {
    orgIds.add(r.requesting_organization_id)
    orgIds.add(r.target_organization_id)
    if (r.resource_id) projectIds.add(r.resource_id)
  }

  const orgNameById = new Map<string, string>()
  if (orgIds.size > 0) {
    const { data: orgs } = await supabase
      .from('organizations')
      .select('id, name')
      .in('id', Array.from(orgIds))
    for (const o of orgs ?? []) orgNameById.set(o.id, o.name)
  }

  const projectMeta = new Map<string, { state: string | null; funding_status: string | null; status: string }>()
  if (projectIds.size > 0) {
    const { data: projects } = await supabase
      .from('err_projects')
      .select('id, state, funding_status, status')
      .in('id', Array.from(projectIds))
    for (const p of projects ?? []) {
      projectMeta.set(p.id, {
        state: p.state,
        funding_status: p.funding_status,
        status: p.status,
      })
    }
  }

  const requests = (data ?? []).map((r) => ({
    ...r,
    requesting_org_name: orgNameById.get(r.requesting_organization_id) ?? null,
    target_org_name: orgNameById.get(r.target_organization_id) ?? null,
    project: r.resource_id ? projectMeta.get(r.resource_id) ?? null : null,
    can_decide:
      isProcessorOrg(canvas.organization) &&
      r.status === 'pending' &&
      isCanvasAdmin(user.role),
  }))

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
    resource_id?: string
    target_organization_id?: string
    scope?: string
    reason?: string
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const resourceType = body.resource_type ?? 'err_project'
  if (resourceType !== 'err_project') {
    return NextResponse.json({ error: 'Unsupported resource_type' }, { status: 400 })
  }

  const scope = body.scope === 'org_resource_type' ? 'org_resource_type' : 'record'
  const resourceId = typeof body.resource_id === 'string' ? body.resource_id.trim() : null
  let targetOrgId =
    typeof body.target_organization_id === 'string'
      ? body.target_organization_id.trim()
      : null

  if (scope === 'record') {
    if (!resourceId) {
      return NextResponse.json({ error: 'resource_id required for record scope' }, { status: 400 })
    }
    const { data: project, error: projErr } = await supabase
      .from('err_projects')
      .select('id, organization_id, funding_status')
      .eq('id', resourceId)
      .maybeSingle()

    if (projErr || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }
    if (!project.organization_id) {
      return NextResponse.json({ error: 'Project has no owning organization' }, { status: 400 })
    }
    const owningOrgId = project.organization_id
    targetOrgId = owningOrgId

    const policy = await getDisclosurePolicy(supabase, owningOrgId, 'err_project')
    if (!policy?.advertise_existence) {
      return NextResponse.json(
        { error: 'Project is not advertised for access requests' },
        { status: 403 }
      )
    }
  } else if (!targetOrgId) {
    return NextResponse.json(
      { error: 'target_organization_id required for org_resource_type scope' },
      { status: 400 }
    )
  }

  const { data: targetOrg } = await supabase
    .from('organizations')
    .select('id, org_type')
    .eq('id', targetOrgId!)
    .maybeSingle()

  if (!targetOrg || targetOrg.org_type !== 'processor') {
    return NextResponse.json({ error: 'Target must be a processor organization' }, { status: 400 })
  }

  // Prevent duplicate pending requests for same record
  if (scope === 'record' && resourceId) {
    const { data: existing } = await supabase
      .from('access_requests')
      .select('id')
      .eq('requesting_organization_id', canvas.organization.id)
      .eq('resource_type', resourceType)
      .eq('resource_id', resourceId)
      .eq('status', 'pending')
      .maybeSingle()

    if (existing) {
      return NextResponse.json(
        { error: 'A pending request already exists', request: existing },
        { status: 409 }
      )
    }
  }

  const insert = {
    requesting_organization_id: canvas.organization.id,
    target_organization_id: targetOrgId!,
    requested_by: user.id,
    resource_type: resourceType,
    resource_id: scope === 'record' ? resourceId : null,
    scope,
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
    return NextResponse.json({ error: 'Failed to create request' }, { status: 500 })
  }

  await emitAccessRequestAudit({
    action: 'access_request.created',
    actorUserId: user.id,
    requestId: created.id,
    endpoint: 'POST /api/canvas/access-requests',
    request,
    newValues: {
      status: 'pending',
      scope,
      resource_type: resourceType,
      resource_id: resourceId,
      target_organization_id: targetOrgId,
    },
  })

  return NextResponse.json({ request: created }, { status: 201 })
}
