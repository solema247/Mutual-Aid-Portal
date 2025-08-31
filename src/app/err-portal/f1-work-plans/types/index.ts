export type FundingStatus = 'unassigned' | 'allocated' | 'reassigned'

export interface PlannedActivity {
  duration: number
  location: string
  quantity: number
  selectedActivity: string
  expenses: {
    total: number
    expense: string
    frequency: string
    unitPrice: string
    description: string
  }[]
}

export interface EmergencyRoom {
  id: string
  name: string
  name_ar: string | null
  err_code: string | null
}

export interface F1Project {
  id: string
  date: string
  state: string
  locality: string
  status: 'new' | 'feedback' | 'active' | 'declined' | 'draft' | 'pending' | 'approved'
  language: string
  project_objectives: string
  intended_beneficiaries: string
  estimated_beneficiaries: number
  estimated_timeframe: string
  additional_support: string
  submitted_at: string
  planned_activities: PlannedActivity[]
  err_id: string
  version: number
  current_feedback_id: string | null
  grant_call_id: string | null
  grant_serial_id: string | null
  funding_status: FundingStatus
  emergency_rooms?: EmergencyRoom | null
  grant_calls?: GrantCall | null
}

export interface GrantCall {
  id: string
  name: string
  shortname: string | null
  status: 'open' | 'closed'
  amount: number | null
}

export interface StateAllocation {
  id: string
  grant_call_id: string
  state_name: string
  amount: number
  decision_no: number
}
