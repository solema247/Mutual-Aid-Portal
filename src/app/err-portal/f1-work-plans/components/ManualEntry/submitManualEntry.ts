/**
 * Submit logic for manual F1 entry. Mirrors DirectUpload handleConfirmUpload
 * but with no file (temp_file_key: null). Kept in a separate file for clarity.
 */

import { supabase } from '@/lib/supabaseClient'
import type { ManualEntryFormData, Expense, PlannedActivity } from './types'

function normalizePlannedActivities(activities: PlannedActivity[] | { activity: string; category: string | null; individuals: number | null; families: number | null; planned_activity_cost: number | null }[]): any[] {
  if (!Array.isArray(activities) || activities.length === 0) return []
  if (typeof activities[0] === 'object' && activities[0] !== null && 'activity' in activities[0]) {
    return activities as any[]
  }
  return (activities as any[]).map(activity => ({
    activity: activity || '',
    category: null,
    individuals: null,
    families: null,
    planned_activity_cost: null
  }))
}

async function translateFields(data: ManualEntryFormData, sourceLanguage: string): Promise<{ translatedData: ManualEntryFormData; originalText: any }> {
  if (sourceLanguage !== 'ar') {
    return {
      translatedData: data,
      originalText: {
        source_language: sourceLanguage,
        project_objectives: null,
        intended_beneficiaries: null,
        estimated_timeframe: null,
        additional_support: null,
        banking_details: null,
        program_officer_name: null,
        reporting_officer_name: null,
        finance_officer_name: null,
        planned_activities: [],
        expenses: []
      }
    }
  }

  const translateText = async (text: string | null): Promise<string | null> => {
    if (!text || text.trim() === '') return text
    try {
      const response = await fetch('/api/translate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: 'ar', target: 'en' })
      })
      if (!response.ok) return text
      const result = await response.json()
      return result.translatedText || text
    } catch {
      return text
    }
  }

  const translatePlannedActivities = async (activities: PlannedActivity[]): Promise<PlannedActivity[]> => {
    if (!activities.length) return []
    const out: PlannedActivity[] = []
    for (const a of activities) {
      const translated = await translateText(a.activity)
      out.push({ ...a, activity: translated || a.activity })
    }
    return out
  }

  const translateExpenses = async (expenses: Expense[]): Promise<Expense[]> => {
    if (!expenses.length) return []
    const out: Expense[] = []
    for (const e of expenses) {
      out.push({
        ...e,
        activity: (await translateText(e.activity)) || e.activity,
        planned_activity: e.planned_activity ? ((await translateText(e.planned_activity)) || e.planned_activity) : null,
        planned_activity_other: e.planned_activity_other ? ((await translateText(e.planned_activity_other)) || e.planned_activity_other) : null
      })
    }
    return out
  }

  const translatedData = { ...data }
  translatedData.project_objectives = await translateText(data.project_objectives)
  translatedData.intended_beneficiaries = await translateText(data.intended_beneficiaries)
  translatedData.estimated_timeframe = await translateText(data.estimated_timeframe)
  translatedData.additional_support = await translateText(data.additional_support)
  translatedData.banking_details = await translateText(data.banking_details)
  translatedData.program_officer_name = await translateText(data.program_officer_name)
  translatedData.reporting_officer_name = await translateText(data.reporting_officer_name)
  translatedData.finance_officer_name = await translateText(data.finance_officer_name)
  translatedData.planned_activities = await translatePlannedActivities(data.planned_activities)
  translatedData.expenses = await translateExpenses(data.expenses)

  const originalText = {
    source_language: sourceLanguage,
    project_objectives: data.project_objectives,
    intended_beneficiaries: data.intended_beneficiaries,
    estimated_timeframe: data.estimated_timeframe,
    additional_support: data.additional_support,
    banking_details: data.banking_details,
    program_officer_name: data.program_officer_name,
    reporting_officer_name: data.reporting_officer_name,
    finance_officer_name: data.finance_officer_name,
    planned_activities: data.planned_activities.map(a => ({ activity: a.activity })),
    expenses: data.expenses.map(e => ({ activity: e.activity, planned_activity: e.planned_activity || null, planned_activity_other: e.planned_activity_other || null }))
  }

  return { translatedData, originalText }
}

export interface SubmitManualEntryOptions {
  stateName: string
  emergency_room_id: string
  err_code: string | null
  grant_segment?: string | null
  /** Storage key for optional attachment (same pattern as OCR: f1-forms/_incoming/<uuid>.<ext>) */
  temp_file_key?: string | null
}

export async function submitManualEntry(
  formData: ManualEntryFormData,
  options: SubmitManualEntryOptions
): Promise<void> {
  const { stateName, emergency_room_id, err_code, grant_segment, temp_file_key: tempFileKey } = options
  const sourceLanguage = formData.language || 'en'
  const { translatedData, originalText } = await translateFields(formData, sourceLanguage)

  const expensesForDB = (translatedData.expenses || []).map((e: Expense) => ({
    activity: e.activity,
    total_cost: e.total_cost_usd || 0,
    category: e.category || null,
    planned_activity: e.planned_activity || null,
    planned_activity_other: e.planned_activity_other || null
  }))

  const plannedActivitiesForDB = normalizePlannedActivities(translatedData.planned_activities || [])

  const { form_currency, exchange_rate, ...dataForDB } = translatedData as any
  const projectName = dataForDB.locality || null

  let dbDate: string | null = null
  if (typeof dataForDB.date === 'string') {
    const val = dataForDB.date
    if (/^\d{4}$/.test(val)) {
      const mm = val.slice(0, 2)
      const yy = val.slice(2, 4)
      dbDate = `20${yy}-${mm}-01`
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(val)) {
      dbDate = val
    }
  }

  const { error: insertError } = await supabase
    .from('err_projects')
    .insert([{
      ...dataForDB,
      date: dbDate,
      expenses: expensesForDB,
      planned_activities: plannedActivitiesForDB,
      emergency_room_id,
      err_id: err_code,
      status: 'pending',
      source: 'mutual_aid_portal',
      state: stateName,
      project_name: projectName,
      temp_file_key: tempFileKey ?? null,
      original_text: originalText,
      language: sourceLanguage,
      grant_segment: grant_segment || null
    }])

  if (insertError) {
    console.error('Manual entry insert error:', insertError)
    throw insertError
  }
}
