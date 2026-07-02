export interface Signature {
  id: string
  name: string
  role?: string
  date: string
}

export interface MOU {
  id: string
  mou_code: string
  partner_name: string
  err_name: string
  state: string | null
  total_amount: number
  start_date: string | null
  end_date: string | null
  file_key: string | null
  payment_confirmation_file: string | null
  exchange_rate: number | null
  transfer_date: string | null
  signed_mou_file_key: string | null
  banking_details_override: string | null
  partner_contact_override: string | null
  err_contact_override: string | null
  partner_signature: string | null
  err_signature: string | null
  signature_date: string | null
  signatures: Signature[] | null
  created_at: string
}

export interface MOUProject {
  id?: string
  banking_details: string | null
  program_officer_name: string | null
  program_officer_phone: string | null
  reporting_officer_name: string | null
  reporting_officer_phone: string | null
  finance_officer_name: string | null
  finance_officer_phone: string | null
  project_objectives: string | null
  intended_beneficiaries: string | null
  planned_activities: string | null
  planned_activities_resolved?: string | null
  locality: string | null
  state: string | null
  'Sector (Primary)'?: string | null
  'Sector (Secondary)'?: string | null
  emergency_rooms?: { name: string | null; name_ar: string | null; err_code: string | null } | null
  expenses?: unknown
}

export interface MOUDetail {
  mou: MOU
  projects?: MOUProject[] | null
  project?: MOUProject | null
  partner?: {
    name: string
    contact_person: string | null
    email: string | null
    phone_number: string | null
    address: string | null
    position?: string | null
  } | null
}

export interface MouProjectRow {
  id: string
  err_id: string | null
  state: string
  locality: string | null
  grant_id: string | null
  amount_usd: number
  categories: string
  project_objectives: string | null
}

export interface MouProjectRowWithoutGrant {
  id: string
  err_id: string | null
  state: string
  locality: string | null
  amount_usd: number
  categories: string
  project_objectives: string | null
}

export interface PaymentProjectRow {
  id: string
  err_id: string | null
  state: string
  locality: string | null
  emergency_room_name: string | null
  grant_id: string | null
}

export interface PaymentConfirmationEntry {
  exchange_rate: string
  transfer_date: string
  file: File | null
  file_path?: string
}

export interface MouAssignmentStatus {
  hasUnassigned: boolean
  hasAssigned: boolean
  projectCount: number
}

export interface RemainingAmounts {
  total: number
  historical: number
  committed: number
  allocated: number
  remaining: number
  loading: boolean
}

export interface MouPreviewTranslations {
  objectives_en?: string
  beneficiaries_en?: string
  activities_en?: string
  objectives_ar?: string
  beneficiaries_ar?: string
  activities_ar?: string
}

export interface GrantGridEntry {
  grant_id: string
  donor_name: string
  project_name: string
  donor_id: string
}

export interface MouProjectAssignmentRow {
  id: string
  err_id: string | null
  state: string
  locality: string | null
}
