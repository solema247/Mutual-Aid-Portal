import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabaseAdmin'
import { requireAuditLogViewer } from '@/lib/requireAuditLogViewer'
import { AUDIT_ACTION_DEFS } from '@/lib/auditActionLabels'
import { AUDIT_TARGET_TYPES } from '@/lib/auditLog'
import { getAuditTargetTypeFallback } from '@/lib/auditTargetTypeLabels'

/**
 * GET /api/audit-logs/filter-options
 * Distinct actors + static action/target-type options for Audit Log filters.
 */
export async function GET() {
  const auth = await requireAuditLogViewer()
  if (auth instanceof NextResponse) return auth

  let admin
  try {
    admin = getSupabaseAdmin()
  } catch (e) {
    console.error('GET /api/audit-logs/filter-options admin client:', e)
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  // Recent distinct actors (bounded scan of newest logs)
  const { data: recent, error } = await admin
    .from('audit_logs')
    .select('actor_user_id')
    .not('actor_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) {
    console.error('GET /api/audit-logs/filter-options:', error)
    return NextResponse.json({ error: 'Failed to load filter options' }, { status: 500 })
  }

  const actorIds = [
    ...new Set(
      (recent ?? [])
        .map((r) => r.actor_user_id as string | null)
        .filter((id): id is string => !!id)
    ),
  ].slice(0, 100)

  let actors: Array<{ value: string; label: string }> = []
  if (actorIds.length > 0) {
    const { data: users } = await admin
      .from('users')
      .select('id, display_name')
      .in('id', actorIds)
    const labelById = new Map<string, string>()
    for (const u of users ?? []) {
      labelById.set(
        u.id as string,
        (u.display_name as string | null)?.trim() || (u.id as string).slice(0, 8)
      )
    }
    actors = actorIds.map((id) => ({
      value: id,
      label: labelById.get(id) || `${id.slice(0, 8)}…`,
    }))
    actors.sort((a, b) => a.label.localeCompare(b.label))
  }

  return NextResponse.json({
    actors,
    actions: AUDIT_ACTION_DEFS.map((d) => ({
      value: d.action,
      label: d.fallback,
    })),
    targetTypes: AUDIT_TARGET_TYPES.map((value) => ({
      value,
      label: getAuditTargetTypeFallback(value),
    })),
  })
}
