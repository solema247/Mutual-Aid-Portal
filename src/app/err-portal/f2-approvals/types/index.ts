export interface Workplan {
  id: string;
  workplan_number: number;
  err_id: string;
  locality: string;
  "Sector (Primary)": string;
  expenses: Array<{ activity: string; total_cost: number; }> | string;
  status: 'pending' | 'approved';
  funding_status: 'pending' | 'allocated' | 'committed';
  // NEW: Add cycle context
  funding_cycle_id: string;
  cycle_state_allocation_id: string;
  grant_serial_id: string;
  source?: string | null;
  // Keep existing fields for backward compatibility
  grant_call_id: string;
  grant_call_state_allocation_id: string;
}

// NEW: F2 Redesign interfaces
export interface UncommittedF1 {
  id: string
  err_id: string
  date: string
  state: string
  locality: string
  status: string
  funding_status: string
  expenses: Array<{ activity: string; total_cost: number }>
  grant_call_id: string | null
  grant_call_name: string | null
  donor_name: string | null
  emergency_room_id: string | null
  err_code: string | null
  err_name: string | null
  submitted_at: string
  approval_file_key?: string | null
  temp_file_key?: string | null
  grant_id?: string | null
  grant_serial_id?: string | null
  workplan_number?: number | null
}

export interface CommittedF1 {
  id: string
  err_id: string
  date: string
  state: string
  locality: string
  status: string
  funding_status: string
  expenses: Array<{ activity: string; total_cost: number }>
  grant_call_id: string | null
  grant_call_name: string | null
  donor_name: string | null
  emergency_room_id: string | null
  err_code: string | null
  err_name: string | null
  submitted_at: string
  committed_at: string
  funding_cycle_id: string | null
  funding_cycle_name: string | null
  mou_id?: string | null
  file_key?: string | null
  temp_file_key?: string | null
  grant_id?: string | null
  grant_serial_id?: string | null
  workplan_number?: number | null
}

export interface GrantCallOption {
  id: string
  name: string
  donor_name: string
  remaining_amount: number
}

export interface FilterOptions {
  grantCalls: Array<{ id: string; name: string; donor_name: string }>
  donors: Array<{ id: string; name: string }>
  cycles: Array<{ id: string; name: string; year: number }>
  states: Array<{ name: string }>
}

export interface StateAllocation {
  id: string;
  state_name: string;
  amount: number;
  decision_no: number;
  total_committed: number;
  remaining: number;
  // NEW: Add cycle context
  cycle_id?: string;
  funding_cycle?: FundingCycle;
}

export interface AllocationSummary {
  funding_cycle: {                    // NEW: Replace grant_call
    id: string;
    name: string;
    cycle_number: number;
    year: number;
  };
  total_amount: number;
  state_allocations: StateAllocation[];
  total_allocated: number;
  total_committed: number;
  remaining: number;
}

export interface CommitmentLedgerEntry {
  id: string;
  workplan_id: string;
  // NEW: Add cycle context
  funding_cycle_id: string;
  cycle_state_allocation_id: string;
  grant_serial_id: string;
  delta_amount: number;
  reason: string;
  created_at: string;
  created_by: string | null;
  // Keep existing fields for backward compatibility
  grant_call_id: string;
  grant_call_state_allocation_id: string;
}

export interface ReassignmentData {
  workplan_id: string;
  // NEW: Add cycle context
  new_funding_cycle_id: string;
  new_cycle_allocation_id: string;
  new_serial_id: string;
  reason: string;
  // Keep existing fields for backward compatibility
  new_grant_call_id: string;
  new_allocation_id: string;
}

export interface Expense {
  activity: string;
  total_cost: number;
}

export interface AdjustmentData {
  workplan_id: string;
  expenses: Expense[];
  reason: string;
}

// NEW: Add cycle-related interfaces
export interface FundingCycle {
  id: string;
  cycle_number: number;
  year: number;
  name: string;
  status: 'open' | 'closed';
  start_date: string | null;
  end_date: string | null;
}
