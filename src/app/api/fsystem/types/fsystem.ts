export interface Donor {
  id: string;
  name: string;
  code: string;
  status: string;
}

export interface State {
  id: string;
  state_name: string;
  state_name_ar: string;
  locality: string;
  locality_ar: string;
}

export interface F1FormData {
  donor_id: string;
  state_id: string;
  date: string; // MMYY format
  grant_serial: string;
  project_id: string;
  file: File | null;
}

export interface F1FormResponse {
  success: boolean;
  form_id?: string;
  error?: string;
} 