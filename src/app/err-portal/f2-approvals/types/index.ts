export interface Workplan {
  id: string;
  workplan_number: number;
  err_id: string;
  locality: string;
  "Sector (Primary)": string;
  expenses: Array<{ activity: string; total_cost: number; }> | string;
  status: 'pending' | 'approved';
  funding_status: 'pending' | 'allocated' | 'committed';
  grant_call_id: string;
  grant_call_state_allocation_id: string;
  grant_serial_id: string;
  source?: string | null;
}

export interface StateAllocation {
  id: string;
  state_name: string;
  amount: number;
  decision_no: number;
  total_committed: number;
  remaining: number;
}

export interface AllocationSummary {
  grant_call: {
    id: string;
    name: string;
    shortname: string;
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
  grant_call_id: string;
  grant_call_state_allocation_id: string;
  grant_serial_id: string;
  delta_amount: number;
  reason: string;
  created_at: string;
  created_by: string | null;
}

export interface ReassignmentData {
  workplan_id: string;
  new_grant_call_id: string;
  new_allocation_id: string;
  new_serial_id: string;
  reason: string;
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
