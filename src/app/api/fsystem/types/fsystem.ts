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
  locality?: string | null;
  locality_ar?: string | null;
}

export interface F1FormData {
  donor_id: string;
  state_id: string;
  date: string; // MMYY format
  grant_serial: string;
  project_id: string;
  emergency_room_id: string;
  file: File | null;
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