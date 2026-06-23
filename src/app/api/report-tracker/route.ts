import { NextResponse } from 'next/server'
import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { getUserStateAccess } from '@/lib/userStateAccess'
import { getActivityAndCategoryLists, getSectorWithHighestAmount } from '@/lib/plannedActivitiesExpenses'
import { pickF5TextForEnUi } from '@/lib/storiesEnDisplay'

function sumPlanFromPlannedActivities(planned: any): number {
  try {
    const arr = Array.isArray(planned) ? planned : (typeof planned === 'string' ? JSON.parse(planned || '[]') : [])
    return (arr || []).reduce((s: number, a: any) => {
      const exps = Array.isArray(a?.expenses) ? a.expenses : []
      return s + exps.reduce((ss: number, e: any) => ss + (Number(e?.total) || 0), 0)
    }, 0)
  } catch {
    return 0
  }
}

function sumPlanFromExpenses(expenses: any): number {
  try {
    const arr = Array.isArray(expenses) ? expenses : (typeof expenses === 'string' ? JSON.parse(expenses || '[]') : [])
    return (arr || []).reduce((s: number, e: any) => s + (Number(e?.total_cost) || 0), 0)
  } catch {
    return 0
  }
}

const OVERDUE_DAYS_AFTER_TRANSFER = 32
const OVERDUE_COMPLETE_STATUSES = ['completed', 'in review', 'under review', 'partial']

function isStatusCompleteForOverdue(status: string | null | undefined): boolean {
  const s = (status ?? '').toString().trim().toLowerCase()
  return OVERDUE_COMPLETE_STATUSES.some((allowed) => s === allowed || s === allowed.replace(' ', '_'))
}

function computeOverdue(
  transferDate: string | null,
  f4Complete: boolean,
  f5Complete: boolean
): { is_overdue: boolean; days_overdue: number | null } {
  if (!transferDate) return { is_overdue: false, days_overdue: null }
  const due = new Date(transferDate)
  due.setDate(due.getDate() + OVERDUE_DAYS_AFTER_TRANSFER)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  due.setHours(0, 0, 0, 0)
  if (due >= today) return { is_overdue: false, days_overdue: null }
  const bothComplete = f4Complete && f5Complete
  if (bothComplete) return { is_overdue: false, days_overdue: null }
  const diffMs = today.getTime() - due.getTime()
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000))
  return { is_overdue: true, days_overdue: days }
}

/** Status to percentage: Waiting 0%, Under review 25%, Partial 50%, Completed 100%. */
function statusToPercent(status: string | null | undefined): number {
  const s = (status ?? '').toString().trim().toLowerCase()
  if (s === 'completed') return 100
  if (s === 'partial') return 50
  if (s === 'in review' || s === 'under review') return 25
  if (s === 'waiting') return 0
  return 0
}

/**
 * English UI: use pickF5TextForEnUi (primary + _en cache, same as overview).
 * Arabic (or other) UI: show primary text, then fall back to _en if primary is empty.
 */
function pickNarrativeForReportTracker(
  useEnUi: boolean,
  language: string | null | undefined,
  primary: string | null | undefined,
  enCached: string | null | undefined
): string | null {
  if (useEnUi) {
    return pickF5TextForEnUi(language, primary, enCached)
  }
  const p = primary?.trim()
  if (p) return primary!
  const e = enCached?.trim()
  if (e) return enCached!
  return null
}

/**
 * PostgREST sends `.in()` as a long query string; hundreds of UUIDs can exceed URL limits
 * and surface as undici `TypeError: fetch failed`.
 */
const SUPABASE_IN_BATCH = 80

function chunkIds<T extends string | number>(ids: T[]): T[][] {
  if (ids.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < ids.length; i += SUPABASE_IN_BATCH) {
    out.push(ids.slice(i, i + SUPABASE_IN_BATCH))
  }
  return out
}

/**
 * GET /api/report-tracker
 * Returns err_projects list for Report Tracker with overdue, f4_pct, f5_pct, tracker (same logic as project management).
 * Query: `locale` (e.g. from i18n) — `en` uses F5 _en cache for Arabic-authored reports; `ar` prefers primary columns.
 */
export async function GET(request: Request) {
  try {
    const loc = new URL(request.url).searchParams.get('locale')?.toLowerCase() ?? ''
    /** Arabic UI: prefer primary Arabic columns (+ en fallback). Other locales: same as Stories overview (en cache for ar-authored reports). */
    const useEnUi = loc === '' || !loc.startsWith('ar')
    const supabase = getSupabaseRouteClient()
    const { allowedStateNames } = await getUserStateAccess()

    let query = supabase
      .from('err_projects')
      .select(`
        id,
        grant_id,
        state,
        locality,
        project_name,
        project_objectives,
        date,
        date_transfer,
        mou_id,
        f4_status,
        f5_status,
        source,
        expenses,
        planned_activities,
        grant_segment,
        grant_grid_id,
        estimated_beneficiaries,
        emergency_rooms ( err_code ),
        donors ( name, short_name )
      `)
      .in('status', ['approved', 'active', 'pending', 'completed'])

    if (allowedStateNames !== null && allowedStateNames.length > 0) {
      query = query.in('state', allowedStateNames)
    }

    const { data: rows, error } = await query.order('state').order('grant_id')

    if (error) {
      console.error('Report tracker fetch error:', error)
      return NextResponse.json({ error: 'Failed to fetch report tracker data' }, { status: 500 })
    }

    const projectIds = (rows || []).map((p: any) => p.id).filter(Boolean)
    const mouIds = Array.from(new Set((rows || []).map((p: any) => p.mou_id).filter(Boolean))) as string[]
    const f5ReportedIndividualsByProject: Record<string, number> = {}
    const f5ReportedHouseholdsByProject: Record<string, number> = {}
    for (const id of projectIds) {
      f5ReportedIndividualsByProject[id] = 0
      f5ReportedHouseholdsByProject[id] = 0
    }
    let transferDateByProject: Record<string, string> = {}
    let rateByProject: Record<string, number> = {}
    if (mouIds.length > 0) {
      const { data: mousRows } = await supabase
        .from('mous')
        .select('id, payment_confirmation_file')
        .in('id', mouIds)
      for (const mou of mousRows || []) {
        const raw = (mou as any)?.payment_confirmation_file
        if (!raw || typeof raw !== 'string') continue
        try {
          const parsed = JSON.parse(raw)
          if (parsed && typeof parsed === 'object') {
            for (const [projectId, data] of Object.entries(parsed)) {
              const d = (data as any)?.transfer_date
              if (d && typeof d === 'string') transferDateByProject[projectId] = d
              const rateVal = (data as any)?.exchange_rate
              if (rateVal != null && !Number.isNaN(Number(rateVal))) rateByProject[projectId] = Number(rateVal)
            }
          }
        } catch {
          // ignore
        }
      }
    }
    const amountsByProject: Record<string, { amount_usd: number; amount_sdg: number; f4_count: number }> = {}
    const dateByProject: Record<string, string | null> = {}
    const f5CountByProject: Record<string, number> = {}
    const latestF5NarrativeByProject: Record<string, { challenges: string | null; lessons: string | null; recommendations: string | null }> = {}
    for (const id of projectIds) {
      amountsByProject[id] = { amount_usd: 0, amount_sdg: 0, f4_count: 0 }
      f5CountByProject[id] = 0
      dateByProject[id] = null
    }

    if (projectIds.length > 0) {
      let summaries: any[] = []
      for (const batch of chunkIds(projectIds)) {
        const { data: batchSummaries, error: sumErr } = await supabase
          .from('err_summary')
          .select('id, project_id, report_date, total_expenses, total_expenses_sdg')
          .in('project_id', batch)
          .is('activities_raw_import_id', null)
          .order('report_date', { ascending: false })
        if (sumErr) console.error('Report tracker err_summary fetch:', sumErr)
        summaries.push(...(batchSummaries || []))
      }
      summaries.sort((a, b) => {
        const ta = a?.report_date ? new Date(a.report_date).getTime() : 0
        const tb = b?.report_date ? new Date(b.report_date).getTime() : 0
        return tb - ta
      })

      const summaryIds: number[] = []
      for (const s of summaries || []) {
        const pid = (s as any).project_id
        if (!pid) continue
        const sid = (s as any).id
        if (sid != null) summaryIds.push(sid)
        if (!amountsByProject[pid]) amountsByProject[pid] = { amount_usd: 0, amount_sdg: 0, f4_count: 0 }
        amountsByProject[pid].f4_count += 1
        const usd = Number((s as any).total_expenses)
        const sdg = Number((s as any).total_expenses_sdg)
        if (!Number.isNaN(usd)) amountsByProject[pid].amount_usd += usd
        if (!Number.isNaN(sdg)) amountsByProject[pid].amount_sdg += sdg
        if (dateByProject[pid] == null && (s as any).report_date)
          dateByProject[pid] = (s as any).report_date
      }

      let f5Reports: any[] = []
      for (const batch of chunkIds(projectIds)) {
        const { data: batchF5, error: f5Err } = await supabase
          .from('err_program_report')
          .select(
            'id, project_id, report_date, language, negative_results, lessons_learned, suggestions, negative_results_en, lessons_learned_en, suggestions_en'
          )
          .in('project_id', batch)
        if (f5Err) {
          console.error('Report tracker err_program_report fetch:', f5Err)
        }
        f5Reports.push(...(batchF5 || []))
      }
      const f5ReportIds: string[] = []
      const reportToProject = new Map<string, string>()
      for (const f5 of f5Reports || []) {
        const pid = (f5 as any).project_id
        const rid = (f5 as any).id
        if (pid) f5CountByProject[pid] = (f5CountByProject[pid] || 0) + 1
        if (rid) {
          f5ReportIds.push(rid)
          reportToProject.set(rid, pid)
        }
      }

      /** Latest F5 report per project (by report_date, then id) for narrative fields */
      const f5ByProject = new Map<string, any[]>()
      for (const f5 of f5Reports || []) {
        const pid = (f5 as any).project_id
        if (!pid) continue
        if (!f5ByProject.has(pid)) f5ByProject.set(pid, [])
        f5ByProject.get(pid)!.push(f5)
      }
      for (const [pid, reports] of f5ByProject) {
        const sorted = [...reports].sort((a, b) => {
          const da = a.report_date ? new Date(a.report_date).getTime() : 0
          const db = b.report_date ? new Date(b.report_date).getTime() : 0
          if (db !== da) return db - da
          const ida = String(a.id)
          const idb = String(b.id)
          return idb.localeCompare(ida, undefined, { numeric: true })
        })
        const r = sorted[0]
        latestF5NarrativeByProject[pid] = {
          challenges: pickNarrativeForReportTracker(useEnUi, r.language, r.negative_results, r.negative_results_en),
          lessons: pickNarrativeForReportTracker(useEnUi, r.language, r.lessons_learned, r.lessons_learned_en),
          recommendations: pickNarrativeForReportTracker(useEnUi, r.language, r.suggestions, r.suggestions_en),
        }
      }

      if (f5ReportIds.length > 0) {
        let reachRows: any[] = []
        for (const batch of chunkIds(f5ReportIds)) {
          const { data: batchReach, error: reachErr } = await supabase
            .from('err_program_reach')
            .select('report_id, individual_count, household_count')
            .in('report_id', batch)
          if (reachErr) console.error('Report tracker err_program_reach fetch:', reachErr)
          reachRows.push(...(batchReach || []))
        }
        for (const r of reachRows) {
          const reportId = (r as any).report_id
          const pid = reportId ? reportToProject.get(reportId) : null
          const ind = Number((r as any).individual_count) || 0
          const hh = Number((r as any).household_count) || 0
          if (pid) {
            if (!Number.isNaN(ind)) {
              f5ReportedIndividualsByProject[pid] = (f5ReportedIndividualsByProject[pid] ?? 0) + ind
            }
            if (!Number.isNaN(hh)) {
              f5ReportedHouseholdsByProject[pid] = (f5ReportedHouseholdsByProject[pid] ?? 0) + hh
            }
          }
        }
      }

      if (summaryIds.length > 0) {
        let expenses: any[] = []
        for (const batch of chunkIds(summaryIds)) {
          const { data: batchExp, error: expErr } = await supabase
            .from('err_expense')
            .select('summary_id, expense_amount, expense_amount_sdg')
            .in('summary_id', batch)
          if (expErr) console.error('Report tracker err_expense fetch:', expErr)
          expenses.push(...(batchExp || []))
        }
        const sumBySummary: Record<number, { usd: number; sdg: number }> = {}
        for (const e of expenses) {
          const sid = (e as any).summary_id
          if (sid == null) continue
          if (!sumBySummary[sid]) sumBySummary[sid] = { usd: 0, sdg: 0 }
          const amt = Number((e as any).expense_amount)
          const amtSdg = Number((e as any).expense_amount_sdg)
          if (!Number.isNaN(amt)) sumBySummary[sid].usd += amt
          if (!Number.isNaN(amtSdg)) sumBySummary[sid].sdg += amtSdg
        }
        const summaryToProject = new Map<number, string>()
        for (const s of summaries || []) {
          const pid = (s as any).project_id
          const sid = (s as any).id
          if (pid != null && sid != null) summaryToProject.set(sid, pid)
        }
        for (const [sid, tot] of Object.entries(sumBySummary)) {
          const pid = summaryToProject.get(Number(sid))
          if (pid && amountsByProject[pid]) {
            if (amountsByProject[pid].amount_usd === 0 && tot.usd > 0) amountsByProject[pid].amount_usd = tot.usd
            if (amountsByProject[pid].amount_sdg === 0 && tot.sdg > 0) amountsByProject[pid].amount_sdg = tot.sdg
          }
        }
      }
    }

    const list = (rows || []).map((p: any) => {
      const amounts = amountsByProject[p.id] || { amount_usd: 0, amount_sdg: 0, f4_count: 0 }
      const dateVal = p.date ?? p.date_transfer ?? dateByProject[p.id] ?? null
      const transfer_date = p.date_transfer ?? transferDateByProject[p.id] ?? null
      const plan = p.source === 'mutual_aid_portal'
        ? sumPlanFromExpenses(p.expenses)
        : sumPlanFromPlannedActivities(p.planned_activities)
      const rate = rateByProject[p.id] ?? null
      const amount_usd = plan
      const amount_sdg = rate != null && plan != null && plan > 0
        ? Math.round(plan * rate)
        : amounts.amount_sdg
      const f4_count = amounts.f4_count
      const f5_count = f5CountByProject[p.id] || 0
      const storedF4 = (p.f4_status != null ? String(p.f4_status).trim().toLowerCase() : null) || 'waiting'
      const storedF5 = (p.f5_status != null ? String(p.f5_status).trim().toLowerCase() : null) || 'waiting'
      const f4_status = f4_count > 0 ? 'completed' : storedF4
      const f5_status = f5_count > 0 ? 'completed' : storedF5
      const f4Complete = isStatusCompleteForOverdue(f4_status)
      const f5Complete = isStatusCompleteForOverdue(f5_status)
      const { days_overdue } = computeOverdue(transfer_date, f4Complete, f5Complete)
      const f4_pct = statusToPercent(storedF4)
      const f5_pct = statusToPercent(storedF5)
      const tracker = (f4_pct + f5_pct) / 2
      const donorRow =
        Array.isArray(p.donors) ? p.donors[0] : p.donors ??
        (Array.isArray((p as any).donor) ? (p as any).donor[0] : (p as any).donor)
      const donor = donorRow?.name ?? donorRow?.short_name ?? null
      const { activity_list, expense_category_list } = getActivityAndCategoryLists(p.planned_activities, p.expenses)
      const sector_highest_amount = getSectorWithHighestAmount(p.planned_activities, p.expenses)
      return {
        id: p.id,
        grant_id: p.grant_id ?? '',
        state: p.state ?? '',
        locality: p.locality ?? '',
        err_code: p.emergency_rooms?.err_code ?? '',
        project_name: p.project_name ?? p.project_objectives ?? '',
        donor: donor ?? null,
        date: dateVal,
        transfer_date,
        amount_usd,
        rate: rate ?? null,
        amount_sdg,
        f4_status: storedF4,
        f5_status: storedF5,
        overdue: days_overdue != null ? String(days_overdue) : null,
        f4_pct,
        f5_pct,
        tracker,
        grant_segment: p.grant_segment ?? null,
        grant_grid_id: p.grant_grid_id ?? null,
        activity_list,
        expense_category_list,
        sector_highest_amount,
        estimated_beneficiaries: p.estimated_beneficiaries != null ? Number(p.estimated_beneficiaries) : null,
        f5_reported_individuals: f5ReportedIndividualsByProject[p.id] ?? 0,
        f5_reported_households: f5ReportedHouseholdsByProject[p.id] ?? 0,
        f5_challenges: latestF5NarrativeByProject[p.id]?.challenges ?? null,
        f5_recommendations: latestF5NarrativeByProject[p.id]?.recommendations ?? null,
        f5_lessons_learned: latestF5NarrativeByProject[p.id]?.lessons ?? null,
      }
    })

    return NextResponse.json(list)
  } catch (e) {
    console.error('GET /api/report-tracker:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
