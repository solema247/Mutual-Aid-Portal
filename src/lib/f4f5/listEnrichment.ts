import type { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import { chunkIds } from './listCommon'

export async function loadF4AttachmentCounts(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  summaryIds: number[]
): Promise<Record<number, number>> {
  const attachCounts: Record<number, number> = {}
  if (!summaryIds.length) return attachCounts
  for (const batch of chunkIds(summaryIds)) {
    const { data: atts } = await supabase
      .from('err_summary_attachments')
      .select('summary_id')
      .in('summary_id', batch)
    for (const a of atts || []) {
      const sid = (a as { summary_id: number }).summary_id
      attachCounts[sid] = (attachCounts[sid] || 0) + 1
    }
  }
  return attachCounts
}

export async function loadF5ReachForReports(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  reportIds: string[]
): Promise<{ reachCounts: Record<string, number>; reachHasEndDate: Record<string, boolean> }> {
  const reachCounts: Record<string, number> = {}
  const reachHasEndDate: Record<string, boolean> = {}
  if (!reportIds.length) return { reachCounts, reachHasEndDate }
  for (const batch of chunkIds(reportIds)) {
    const { data: reach } = await supabase
      .from('err_program_reach')
      .select('report_id, end_date')
      .in('report_id', batch)
    for (const row of reach || []) {
      const sid = String((row as { report_id: string }).report_id)
      reachCounts[sid] = (reachCounts[sid] || 0) + 1
      if ((row as { end_date: string | null }).end_date) {
        reachHasEndDate[sid] = true
      }
    }
  }
  return { reachCounts, reachHasEndDate }
}

export async function loadMouPaymentMaps(
  supabase: ReturnType<typeof getSupabaseRouteClient>,
  mouIds: string[],
  projectById: Map<string, Record<string, unknown>>
): Promise<{ transferDateByProject: Record<string, string>; rateByProject: Record<string, number> }> {
  const { loadReportingPaymentMaps } = await import('./paymentSummary')
  return loadReportingPaymentMaps(supabase, mouIds, projectById)
}
