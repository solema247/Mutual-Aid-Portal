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
  // NEW: Cycle-based fields
  funding_cycle_id: string | null
  cycle_state_allocation_id: string | null
  grant_serial_id: string | null
  funding_status: FundingStatus
  workplan_number: number | null
  emergency_rooms?: EmergencyRoom | null
  // Keep existing fields for backward compatibility
  grant_call_id: string | null
  grant_calls?: GrantCall | null
  // NEW: Add cycle context
  funding_cycles?: FundingCycle | null
  cycle_state_allocations?: CycleStateAllocation | null
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
  amount_committed?: number
  amount_allocated?: number
  amount_used?: number
}

// NEW: Add cycle-related interfaces
export interface FundingCycle {
  id: string
  cycle_number: number
  year: number
  name: string
  status: 'open' | 'closed'
  start_date: string | null
  end_date: string | null
}

export interface CycleStateAllocation {
  id: string
  cycle_id: string
  state_name: string
  amount: number
  decision_no: number
}
