import { NextResponse } from 'next/server'
import {
  applyReportingStatusUpdates,
  computeReportingStatusUpdate,
  type ReportingStatusProjectRow,
} from '@/lib/projectStatus'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { assertProjectInGrantAccess } from '@/lib/userGrantAccess'
import { emitF123Audit } from '@/lib/f123Audit'

const ALLOWED_F4 = ['waiting', 'partial', 'in review', 'completed'] as const
const ALLOWED_F5 = ['waiting', 'partial', 'in review', 'completed'] as const

function normalizeStatus(value: unknown, allowed: readonly string[]): string | null {
  if (value == null || value === '') return null
  const s = String(value).trim().toLowerCase()
  if (allowed.includes(s)) return s
  if (s === 'under review') return 'in review'
  return null
}

/**
 * PATCH /api/projects/[id]/reporting-status
 * Body: { f4_status?: 'waiting' | 'partial' | 'in review' | 'completed', f5_status?: same }
 * Only for portal projects (not historical). Updates err_projects.f4_status and/or f5_status.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = getSupabaseRouteClient()
    const { id: projectId } = await params
    if (!projectId) {
      return NextResponse.json({ error: 'Project ID is required' }, { status: 400 })
    }
    if (projectId.startsWith('historical_')) {
      return NextResponse.json({ error: 'Cannot update reporting status for historical projects.' }, { status: 400 })
    }

    const scope = await assertProjectInGrantAccess(projectId)
    if (!scope.ok) return scope.response

    const body = await request.json().catch(() => ({}))
    const f4_status = normalizeStatus(body.f4_status, ALLOWED_F4)
    const f5_status = normalizeStatus(body.f5_status, ALLOWED_F5)

    if (f4_status === null && f5_status === null) {
      return NextResponse.json({ error: 'Provide at least one of f4_status or f5_status.' }, { status: 400 })
    }

    const { data: beforeProj, error: beforeFetchError } = await supabase
      .from('err_projects')
      .select('status, f4_status, f5_status, completed_at, date_report_completed')
      .eq('id', projectId)
      .maybeSingle()

    if (beforeFetchError || !beforeProj) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    const changes: { f4_status?: string; f5_status?: string } = {}
    if (f4_status !== null) changes.f4_status = f4_status
    if (f5_status !== null) changes.f5_status = f5_status

    const preview = await computeReportingStatusUpdate(
      supabase,
      projectId,
      beforeProj as ReportingStatusProjectRow,
      changes
    )
    if (!preview.hasEffectiveChange) {
      return NextResponse.json({ success: true, noop: true })
    }

    const result = await applyReportingStatusUpdates(supabase, projectId, changes)
    if (!result.ok) {
      if (result.error === 'Project not found') {
        return NextResponse.json({ error: result.error }, { status: 404 })
      }
      console.error('Error updating reporting status:', result.error)
      return NextResponse.json({ error: 'Failed to update reporting status' }, { status: 500 })
    }

    const applied = result.applied
    const changedFields: string[] = []
    if (changes.f4_status != null) changedFields.push('f4_status')
    if (changes.f5_status != null) changedFields.push('f5_status')
    const autoCompleted = applied.status === 'completed'

    await emitF123Audit({
      action: 'project.reporting_status_changed',
      endpoint: 'PATCH /api/projects/[id]/reporting-status',
      request,
      targetType: 'project',
      targetId: projectId,
      oldValues: {
        f4_status: beforeProj?.f4_status ?? null,
        f5_status: beforeProj?.f5_status ?? null,
        ...(autoCompleted
          ? {
              status: beforeProj?.status ?? null,
              completed_at: beforeProj?.completed_at ?? null,
              date_report_completed: beforeProj?.date_report_completed ?? null,
            }
          : {}),
      },
      newValues: {
        ...(changes.f4_status != null ? { f4_status: changes.f4_status } : {}),
        ...(changes.f5_status != null ? { f5_status: changes.f5_status } : {}),
        ...(autoCompleted
          ? {
              status: applied.status ?? null,
              completed_at: applied.completed_at ?? null,
              date_report_completed: applied.date_report_completed ?? null,
            }
          : {}),
      },
      metadata: {
        project_id: projectId,
        changed_fields: changedFields,
        ...(autoCompleted ? { auto_completed_project: true } : {}),
      },
    })

    return NextResponse.json({ success: true, ...result.applied })
  } catch (e) {
    console.error('PATCH /api/projects/[id]/reporting-status:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
