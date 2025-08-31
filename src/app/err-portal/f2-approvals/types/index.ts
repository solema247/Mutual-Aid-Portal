export interface Workplan {
  id: string;
  workplan_number: number;
  err_id: string;
  locality: string;
  "Sector (Primary)": string;
  requested_amount: number;
  status: 'pending' | 'approved';
  funding_status: 'pending' | 'committed';
  grant_call_id: string;
  grant_call_state_allocation_id: string;
  grant_serial_id: string;
}

export interface AllocationSummary {
  grant_call: {
    id: string;
    name: string;
    shortname: string;
  };
  state: {
    name: string;
  };
  grant_serial: string;
  decision_no: number;
  allocation_amount: number;
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

export interface AdjustmentData {
  workplan_id: string;
  delta_amount: number;
  reason: string;
}
