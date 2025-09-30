export interface FundingCycle {
  id: string;
  cycle_number: number;
  year: number;
  name: string;
  status: 'open' | 'closed';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  created_by: string | null;
  // New tranche-capable fields
  type?: 'one_off' | 'tranches' | 'emergency';
  tranche_count?: number | null;
  pool_amount?: number;
  tranche_splits?: number[] | null;
}

export interface CycleGrantInclusion {
  id: string;
  cycle_id: string;
  grant_call_id: string;
  amount_included: number;
  created_at: string;
  created_by: string | null;
  // Related data
  grant_calls?: {
    id: string;
    name: string;
    shortname: string | null;
    amount: number | null;
    donor: {
      id: string;
      name: string;
      short_name: string | null;
    };
  };
}

export interface CycleStateAllocation {
  id: string;
  cycle_id: string;
  state_name: string;
  amount: number;
  decision_no: number;
  created_at: string;
  created_by: string | null;
  // Calculated fields
  total_committed?: number;
  total_pending?: number;
  remaining?: number;
}

export interface CycleBudgetSummary {
  cycle: FundingCycle;
  total_available: number;      // Sum of all grant inclusions
  total_allocated: number;      // Sum of state allocations
  total_committed: number;      // Sum of committed workplans
  total_pending: number;        // Sum of pending workplans
  remaining: number;            // Available - allocated
  unused_from_previous: number; // Rollover from previous cycles
}

export interface CycleCreationData {
  cycle_number: number;
  year: number;
  name: string;
  start_date?: string;
  end_date?: string;
  // New fields for tranche cycles
  type?: 'one_off' | 'tranches' | 'emergency';
  tranche_count?: number;
  pool_amount?: number;
  tranche_splits?: number[];
  grant_inclusions: {
    grant_call_id: string;
    amount_included: number;
  }[];
}

export interface CycleStateAllocationData {
  cycle_id: string;
  state_name: string;
  amount: number;
  decision_no: number;
}
