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
  grant_call_id: string;
  grant_call_state_allocation_id: string;
  grant_serial_id: string;
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
} 