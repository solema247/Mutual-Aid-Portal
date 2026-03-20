/**
 * Ensures F5 report (and its reach rows) have cached EN translations when language is ar.
 * Translates via Google, saves to _en columns, so subsequent requests don't call the API.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { translateBatch } from './translateServer'

const SOURCE_LANG = 'ar'
const TARGET_LANG = 'en'

export interface ReportRow {
  id: string
  language: string | null
  positive_changes: string | null
  negative_results: string | null
  unexpected_results: string | null
  lessons_learned: string | null
  suggestions: string | null
  positive_changes_en?: string | null
  negative_results_en?: string | null
  unexpected_results_en?: string | null
  lessons_learned_en?: string | null
  suggestions_en?: string | null
}

export interface ReachRow {
  id: string
  report_id: string
  location: string | null
  activity_name: string | null
  activity_goal: string | null
  location_en?: string | null
  activity_name_en?: string | null
  activity_goal_en?: string | null
}

function needsReportTranslation(r: ReportRow): boolean {
  if ((r.language ?? '').toLowerCase() !== SOURCE_LANG) return false
  const hasAll =
    r.positive_changes_en != null &&
    r.negative_results_en != null &&
    r.unexpected_results_en != null &&
    r.lessons_learned_en != null &&
    r.suggestions_en != null
  return !hasAll
}

/**
 * Ensure one report (and its reach rows) has cached EN. Idempotent.
 */
export async function ensureReportTranslated(
  supabase: SupabaseClient,
  reportId: string
): Promise<void> {
  const { data: report, error: reportErr } = await supabase
    .from('err_program_report')
    .select(
      'id, language, positive_changes, negative_results, unexpected_results, lessons_learned, suggestions, positive_changes_en, negative_results_en, unexpected_results_en, lessons_learned_en, suggestions_en'
    )
    .eq('id', reportId)
    .single()

  if (reportErr || !report) return
  const r = report as ReportRow
  if (!needsReportTranslation(r)) {
    const { data: reachRows } = await supabase
      .from('err_program_reach')
      .select('id, report_id, location, activity_name, activity_goal, location_en, activity_name_en, activity_goal_en')
      .eq('report_id', reportId)
    const reach = (reachRows ?? []) as ReachRow[]
    for (const row of reach) {
      const needs =
        (row.location && !row.location_en) ||
        (row.activity_name && !row.activity_name_en) ||
        (row.activity_goal && !row.activity_goal_en)
      if (!needs) continue
      const reachTexts = [row.location ?? '', row.activity_name ?? '', row.activity_goal ?? '']
      const reachTranslated = await translateBatch(reachTexts, SOURCE_LANG, TARGET_LANG)
      if (reachTranslated.length >= 3) {
        await supabase
          .from('err_program_reach')
          .update({
            location_en: reachTranslated[0] || row.location,
            activity_name_en: reachTranslated[1] || row.activity_name,
            activity_goal_en: reachTranslated[2] || row.activity_goal,
          })
          .eq('id', row.id)
      }
    }
    return
  }

  const texts: string[] = [
    r.positive_changes ?? '',
    r.negative_results ?? '',
    r.unexpected_results ?? '',
    r.lessons_learned ?? '',
    r.suggestions ?? '',
  ]
  const translated = await translateBatch(texts, SOURCE_LANG, TARGET_LANG)
  if (translated.length < 5) return
  await supabase
    .from('err_program_report')
    .update({
      positive_changes_en: translated[0] || r.positive_changes,
      negative_results_en: translated[1] || r.negative_results,
      unexpected_results_en: translated[2] || r.unexpected_results,
      lessons_learned_en: translated[3] || r.lessons_learned,
      suggestions_en: translated[4] || r.suggestions,
    })
    .eq('id', reportId)

  const { data: reachRows } = await supabase
    .from('err_program_reach')
    .select('id, report_id, location, activity_name, activity_goal, location_en, activity_name_en, activity_goal_en')
    .eq('report_id', reportId)
  const reach = (reachRows ?? []) as ReachRow[]
  for (const row of reach) {
    const needs =
      (row.location && !row.location_en) ||
      (row.activity_name && !row.activity_name_en) ||
      (row.activity_goal && !row.activity_goal_en)
    if (!needs) continue
    const reachTexts: string[] = [
      row.location ?? '',
      row.activity_name ?? '',
      row.activity_goal ?? '',
    ]
    const reachTranslated = await translateBatch(reachTexts, SOURCE_LANG, TARGET_LANG)
    if (reachTranslated.length >= 3) {
      await supabase
        .from('err_program_reach')
        .update({
          location_en: reachTranslated[0] || row.location,
          activity_name_en: reachTranslated[1] || row.activity_name,
          activity_goal_en: reachTranslated[2] || row.activity_goal,
        })
        .eq('id', row.id)
    }
  }
}

const TRANSLATE_CONCURRENCY = 8

/**
 * Run tasks in parallel with a concurrency limit.
 */
async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0
  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++
      try {
        await fn(items[i])
      } catch (e) {
        console.error('[translateReportCache] worker error for item', i, e)
      }
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker())
  await Promise.all(workers)
}

/**
 * Ensure multiple reports have cached EN. Processes with limited concurrency to reduce total time while respecting rate limits.
 */
export async function ensureReportsTranslated(
  supabase: SupabaseClient,
  reportIds: string[]
): Promise<void> {
  const unique = [...new Set(reportIds)].filter(Boolean)
  if (unique.length === 0) return
  const t0 = Date.now()
  console.log('[translateReportCache] ensureReportsTranslated start', unique.length, 'report(s), concurrency', TRANSLATE_CONCURRENCY)
  await runWithConcurrency(unique, TRANSLATE_CONCURRENCY, (id) => ensureReportTranslated(supabase, id))
  console.log('[translateReportCache] ensureReportsTranslated done', Date.now() - t0, 'ms')
}
