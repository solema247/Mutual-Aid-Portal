export interface Donor {
  id: string;
  name: string;
  code: string;
  status: string;
  short_name: string;
}

export interface State {
  id: string;
  state_name: string;
  state_name_ar: string | null;
  state_short: string;
  locality?: string | null;
  locality_ar?: string | null;
}

export interface F1FormData {
  donor_id: string;
  state_id: string;
  date: string; // MMYY format
  project_id: string;
  emergency_room_id: string;
  file: File | null;
  primary_sectors: string[];
  secondary_sectors: string[];
  // NEW: Cycle-based fields
  funding_cycle_id: string;
  cycle_state_allocation_id: string;
  grant_serial_id: string;
  currency: 'USD' | 'SDG';
  exchange_rate?: number;
  grant_segment?: 'Flexible' | 'Sustainability' | 'WRR' | 'Capacity Building';
  // Keep old fields for backward compatibility
  grant_call_id?: string;
  grant_call_state_allocation_id?: string;
}

export interface F1FormResponse {
  success: boolean;
  form_id?: string;
  error?: string;
}

export interface EmergencyRoom {
  id: string;
  name: string;
  name_ar: string | null;
  err_code: string | null;
  status: string;
  state_reference: string;
  type: 'state' | 'base';
}

export interface Sector {
  id: string;
  sector_name_en: string;
  sector_name_ar: string | null;
}

export interface GrantCall {
  id: string;
  name: string;
  shortname: string;
  amount: number;
  donor: {
    id: string;
    name: string;
  };
}

export interface StateAllocation {
  id: string;
  state_name: string;
  amount: number;
  amount_used?: number;
  amount_committed?: number;
  amount_pending?: number;
  amount_approved?: number;
  decision_no: number;
  // NEW: Add cycle context
  cycle_id?: string;
  funding_cycle?: FundingCycle;
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
  created_at: string;
  created_by: string | null;
}

export interface CycleGrantInclusion {
  id: string;
  cycle_id: string;
  grant_call_id: string;
  amount_included: number;
  created_at: string;
  created_by: string | null;
}

export interface CycleStateAllocation {
  id: string;
  cycle_id: string;
  state_name: string;
  amount: number;
  decision_no: number;
  created_at: string;
  created_by: string | null;
} 