import { NextResponse } from 'next/server'
import {
  filterMountCodesForOrgType,
  mountAllowedForOrgType,
} from '@/lib/canvas/mountEligibility'
import { isCanvasAdmin, requireCanvasSession } from '@/lib/canvas/session'

type Body = {
  action?: 'enable' | 'disable' | 'apply_template'
  mount_code?: string
  template_code?: string
}

export async function POST(req: Request) {
  const session = await requireCanvasSession()
  if (session instanceof NextResponse) return session

  const { supabase, user, canvas } = session
  if (!isCanvasAdmin(user.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (canvas.is_fallback) {
    return NextResponse.json(
      {
        error:
          'Canvas tables not available on this database. Apply sql/canvas scripts to production first.',
      },
      { status: 503 }
    )
  }

  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const envId = canvas.environment.id
  const orgType = canvas.organization.org_type

  if (body.action === 'apply_template') {
    const templateCode = (body.template_code || '').trim()
    if (!templateCode) {
      return NextResponse.json({ error: 'template_code required' }, { status: 400 })
    }
    const { data: template, error: tErr } = await supabase
      .from('workflow_templates')
      .select('mount_codes')
      .eq('code', templateCode)
      .eq('is_active', true)
      .maybeSingle()
    if (tErr || !template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    }
    const codes = filterMountCodesForOrgType(
      (template.mount_codes ?? []) as string[],
      orgType
    )
    const { error: delErr } = await supabase
      .from('environment_mounts')
      .delete()
      .eq('environment_id', envId)
    if (delErr) {
      console.error('[canvas/mounts] apply_template clear', delErr)
      return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 })
    }
    const rows = codes.map((mount_code, i) => ({
      environment_id: envId,
      mount_code,
      sort_order: i * 10,
    }))
    if (rows.length > 0) {
      const { error: upsertErr } = await supabase.from('environment_mounts').insert(rows)
      if (upsertErr) {
        console.error('[canvas/mounts] apply_template insert', upsertErr)
        return NextResponse.json({ error: 'Failed to apply template' }, { status: 500 })
      }
    }
    return NextResponse.json({ ok: true, mounted_modules: codes })
  }

  const mountCode = (body.mount_code || '').trim()
  if (!mountCode) {
    return NextResponse.json({ error: 'mount_code required' }, { status: 400 })
  }

  if (body.action === 'disable') {
    const { error } = await supabase
      .from('environment_mounts')
      .delete()
      .eq('environment_id', envId)
      .eq('mount_code', mountCode)
    if (error) {
      console.error('[canvas/mounts] disable', error)
      return NextResponse.json({ error: 'Failed to disable mount' }, { status: 500 })
    }
  } else {
    // enable (default)
    if (!mountAllowedForOrgType(mountCode, orgType)) {
      const msg =
        mountCode === 'oversight'
          ? 'Oversight is only available for coordinator organizations'
          : mountCode === 'access_inbox'
            ? 'Access inbox is only available for host organizations'
            : 'This module cannot be mounted for your organization type'
      return NextResponse.json({ error: msg }, { status: 403 })
    }
    const { data: cat } = await supabase
      .from('mount_catalog')
      .select('code, sort_order')
      .eq('code', mountCode)
      .eq('is_active', true)
      .maybeSingle()
    if (!cat) {
      return NextResponse.json({ error: 'Unknown mount' }, { status: 404 })
    }
    const { error } = await supabase.from('environment_mounts').upsert(
      {
        environment_id: envId,
        mount_code: mountCode,
        sort_order: cat.sort_order ?? 0,
      },
      { onConflict: 'environment_id,mount_code' }
    )
    if (error) {
      console.error('[canvas/mounts] enable', error)
      return NextResponse.json({ error: 'Failed to enable mount' }, { status: 500 })
    }
  }

  const { data: mounts } = await supabase
    .from('environment_mounts')
    .select('mount_code')
    .eq('environment_id', envId)
    .order('sort_order', { ascending: true })

  return NextResponse.json({
    ok: true,
    mounted_modules: (mounts ?? []).map((m) => m.mount_code),
  })
}
