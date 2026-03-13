import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { requirePermission } from '@/lib/requirePermission'

/**
 * GET /api/f4/by-serial?serial=XXX
 * Resolves F4 serial (grant_serial_id) to project(s), F4 summaries, expenses, attachments,
 * and MOU payment confirmation (exchange_rate, transfer_date) for LoHub.
 * Requires f4_fetch_by_serial permission.
 */
export async function GET(request: Request) {
  try {
    const perm = await requirePermission('f4_fetch_by_serial')
    if (perm instanceof NextResponse) return perm

    const { searchParams } = new URL(request.url)
    const serial = searchParams.get('serial')?.trim()
    if (!serial) {
      return NextResponse.json({ error: 'Query parameter serial is required' }, { status: 400 })
    }

    const supabase = getSupabaseRouteClient()

    // Find portal projects with this grant_serial_id (include expenses/planned_activities for completion %)
    const { data: projects, error: projErr } = await supabase
      .from('err_projects')
      .select('id, err_id, state, grant_serial_id, mou_id, expenses, planned_activities, emergency_rooms (name, name_ar, err_code), donors (short_name, name)')
      .eq('grant_serial_id', serial)
      .not('grant_serial_id', 'is', null)

    if (projErr) throw projErr
    if (!projects || projects.length === 0) {
      return NextResponse.json(
        { error: 'No project found with this F4 serial', serial },
        { status: 404 }
      )
    }

    const projectIds = projects.map((p: any) => p.id)
    const mouIds = Array.from(new Set(projects.map((p: any) => p.mou_id).filter(Boolean))) as string[]

    // Load MOU codes and payment confirmation (exchange_rate, transfer_date, file_path) per project
    let mouCodeById: Record<string, string> = {}
    let paymentByProjectId: Record<string, { exchange_rate?: number; transfer_date?: string; file_path?: string }> = {}
    if (mouIds.length) {
      const { data: mous } = await supabase
        .from('mous')
        .select('id, mou_code, payment_confirmation_file')
        .in('id', mouIds)
      for (const m of mous || []) {
        mouCodeById[(m as any).id] = (m as any).mou_code || ''
        const raw = (m as any).payment_confirmation_file
        if (raw && typeof raw === 'string') {
          try {
            const parsed = JSON.parse(raw)
            if (parsed && typeof parsed === 'object') {
              for (const [pid, data] of Object.entries(parsed)) {
                const d = data as any
                paymentByProjectId[pid] = {
                  exchange_rate: d?.exchange_rate,
                  transfer_date: d?.transfer_date,
                  file_path: d?.file_path
                }
              }
            }
          } catch {
            // ignore
          }
        }
      }
    }

    // F4 summaries for these projects (portal only)
    const { data: summaries, error: sumErr } = await supabase
      .from('err_summary')
      .select('id, project_id, report_date, total_grant, total_expenses, remainder, lessons, training, excess_expenses, surplus_use, created_at')
      .in('project_id', projectIds)
      .is('activities_raw_import_id', null)
      .order('created_at', { ascending: false })

    if (sumErr) throw sumErr
    const summaryList = summaries || []
    const summaryIds = summaryList.map((s: any) => s.id)

    // Expenses per summary
    let expensesBySummary: Record<number, any[]> = {}
    if (summaryIds.length) {
      const { data: expenses } = await supabase
        .from('err_expense')
        .select('*')
        .in('summary_id', summaryIds)
      for (const e of expenses || []) {
        const sid = (e as any).summary_id
        expensesBySummary[sid] = expensesBySummary[sid] || []
        expensesBySummary[sid].push(e)
      }
    }

    // Attachments per summary
    let attachmentsBySummary: Record<number, any[]> = {}
    if (summaryIds.length) {
      const { data: attachments } = await supabase
        .from('err_summary_attachments')
        .select('*')
        .in('summary_id', summaryIds)
      for (const a of attachments || []) {
        const sid = (a as any).summary_id
        attachmentsBySummary[sid] = attachmentsBySummary[sid] || []
        attachmentsBySummary[sid].push(a)
      }
    }

    // Planned total per project (for completion %)
    const getPlannedTotal = (p: any): number => {
      const plannedArr = Array.isArray(p.planned_activities) ? p.planned_activities : (typeof p.planned_activities === 'string' ? JSON.parse(p.planned_activities || '[]') : [])
      const fromPlanned = (Array.isArray(plannedArr) ? plannedArr : []).reduce((s: number, pa: any) => {
        const inner = Array.isArray(pa?.expenses) ? pa.expenses : []
        return s + inner.reduce((ss: number, ie: any) => ss + (Number(ie.total) || 0), 0)
      }, 0)
      const expensesArr = Array.isArray(p.expenses) ? p.expenses : (typeof p.expenses === 'string' ? JSON.parse(p.expenses || '[]') : [])
      const fromExpenses = (Array.isArray(expensesArr) ? expensesArr : []).reduce((s: number, ex: any) => s + (Number(ex.total_cost) || 0), 0)
      return fromExpenses > 0 ? fromExpenses : fromPlanned
    }

    const summariesWithDetails = summaryList.map((s: any) => {
      const reported_total = (expensesBySummary[s.id] || []).reduce((sum: number, e: any) => sum + (Number(e.expense_amount) || 0), 0)
      return {
        ...s,
        expenses: expensesBySummary[s.id] || [],
        attachments: attachmentsBySummary[s.id] || [],
        reported_total
      }
    })

    // Build response: one entry per project with F1 serial, MOU link, payment confirmation, and F4 summaries (with completion)
    const result = projects.map((p: any) => {
      const planned_total = getPlannedTotal(p)
      const projectSummaries = summariesWithDetails
        .filter((s: any) => s.project_id === p.id)
        .map((s: any) => {
          const completion_percent = planned_total > 0 ? Math.round((s.reported_total / planned_total) * 100) : null
          const totals_match = planned_total > 0 && Math.abs(s.reported_total - planned_total) < 0.01
          return { ...s, completion_percent, planned_total, totals_match }
        })
      const room = p.emergency_rooms || {}
      const donor = p.donors || {}
      return {
        project_id: p.id,
        grant_serial_id: p.grant_serial_id,
        f1_serial: p.grant_serial_id,
        err_id: room.err_code || p.err_id,
        err_name: room.name || room.name_ar || p.err_id,
        state: p.state,
        donor: donor.short_name || donor.name || null,
        mou_id: p.mou_id || null,
        mou_code: p.mou_id ? mouCodeById[p.mou_id] || null : null,
        payment_confirmation: p.mou_id ? paymentByProjectId[p.id] || null : null,
        summaries: projectSummaries
      }
    })

    return NextResponse.json({
      serial,
      projects: result
    })
  } catch (e) {
    console.error('F4 by-serial error', e)
    return NextResponse.json({ error: 'Failed to fetch F4 by serial' }, { status: 500 })
  }
}
