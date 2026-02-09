/** Local types for Manual Entry form - same shape as post-OCR review form. */

export interface Expense {
  activity: string
  total_cost_usd: number
  total_cost_sdg: number | null
  currency: string
  category: string | null
  planned_activity: string | null
  planned_activity_other: string | null
}

export interface PlannedActivity {
  activity: string
  category: string | null
  individuals: number | null
  families: number | null
  planned_activity_cost: number | null
}

export interface ManualEntryFormData {
  date: string | null
  state: string | null
  locality: string | null
  project_objectives: string | null
  intended_beneficiaries: string | null
  estimated_beneficiaries: number | null
  estimated_timeframe: string | null
  additional_support: string | null
  banking_details: string | null
  program_officer_name: string | null
  program_officer_phone: string | null
  reporting_officer_name: string | null
  reporting_officer_phone: string | null
  finance_officer_name: string | null
  finance_officer_phone: string | null
  planned_activities: PlannedActivity[]
  expenses: Expense[]
  language: 'ar' | 'en' | null
  form_currency?: string
  exchange_rate?: number
}

export const defaultFormData: ManualEntryFormData = {
  date: '',
  state: null,
  locality: null,
  project_objectives: null,
  intended_beneficiaries: null,
  estimated_beneficiaries: null,
  estimated_timeframe: null,
  additional_support: null,
  banking_details: null,
  program_officer_name: null,
  program_officer_phone: null,
  reporting_officer_name: null,
  reporting_officer_phone: null,
  finance_officer_name: null,
  finance_officer_phone: null,
  planned_activities: [],
  expenses: [{ activity: '', total_cost_usd: 0, total_cost_sdg: null, currency: 'USD', category: null, planned_activity: null, planned_activity_other: null }],
  language: 'en',
  form_currency: 'USD',
  exchange_rate: 2700
}
