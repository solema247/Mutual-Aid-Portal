// Mock data for compliance screening prototype demo
// This is for demonstration purposes only

export type ScreeningStatus = 'Cleared' | 'Pending' | 'Flagged' | 'Rejected' | 'Not Required'

export interface MockBeneficiary {
  id: string
  full_name: string
  position: string
  phone: string
  f1_project_id: string
  f1_project_name: string
  err_code: string
  state: string
  locality: string
  screening_status: ScreeningStatus
  id_number?: string
  date_of_birth?: string
  queued_at: string
  screened_at?: string
  screened_by?: string
  risk_score?: number
  notes?: string
  match_details?: string
}

export const MOCK_BENEFICIARIES: MockBeneficiary[] = [
  {
    id: '1',
    full_name: 'Ahmed Mohamed Ali',
    position: 'Program Officer',
    phone: '+249912345678',
    f1_project_id: 'f1-001',
    f1_project_name: 'Khartoum Emergency Food Distribution',
    err_code: 'ERR-KH-001',
    state: 'Khartoum',
    locality: 'Omdurman',
    screening_status: 'Cleared',
    id_number: '19850312-001',
    date_of_birth: '1985-03-12',
    queued_at: '2026-03-08T10:00:00Z',
    screened_at: '2026-03-08T14:30:00Z',
    screened_by: 'Compliance Officer 1',
    risk_score: 0,
    notes: 'No OFAC match found. Cleared for payment.'
  },
  {
    id: '2',
    full_name: 'Fatima Hassan Ibrahim',
    position: 'Finance Officer',
    phone: '+249923456789',
    f1_project_id: 'f1-002',
    f1_project_name: 'Darfur Medical Supplies',
    err_code: 'ERR-DF-003',
    state: 'Darfur',
    locality: 'El Fasher',
    screening_status: 'Pending',
    id_number: '19900515-002',
    date_of_birth: '1990-05-15',
    queued_at: '2026-03-09T09:15:00Z',
    risk_score: undefined,
    notes: undefined
  },
  {
    id: '3',
    full_name: 'Omar Abdullah Khalil',
    position: 'Reporting Officer',
    phone: '+249934567890',
    f1_project_id: 'f1-003',
    f1_project_name: 'Gezira Water Infrastructure',
    err_code: 'ERR-GZ-005',
    state: 'Gezira',
    locality: 'Wad Madani',
    screening_status: 'Flagged',
    id_number: '19880722-003',
    date_of_birth: '1988-07-22',
    queued_at: '2026-03-09T08:00:00Z',
    screened_at: '2026-03-09T11:45:00Z',
    screened_by: 'Compliance Officer 1',
    risk_score: 85,
    notes: 'Potential fuzzy name match with OFAC list. Requires manual review.',
    match_details: 'Name: Omar Khalil Abdullah (87% match), DOB: Different (1987-07-20), ID: No match'
  },
  {
    id: '4',
    full_name: 'Maryam Said Ahmed',
    position: 'Program Officer',
    phone: '+249945678901',
    f1_project_id: 'f1-004',
    f1_project_name: 'Port Sudan Shelter Assistance',
    err_code: 'ERR-RS-002',
    state: 'Red Sea',
    locality: 'Port Sudan',
    screening_status: 'Cleared',
    id_number: '19921108-004',
    date_of_birth: '1992-11-08',
    queued_at: '2026-03-07T15:20:00Z',
    screened_at: '2026-03-08T09:00:00Z',
    screened_by: 'Compliance Officer 2',
    risk_score: 0,
    notes: 'Prior screening from Feb 2026. Auto-linked. Cleared.'
  },
  {
    id: '5',
    full_name: 'Ibrahim Yousif Hassan',
    position: 'Finance Officer',
    phone: '+249956789012',
    f1_project_id: 'f1-005',
    f1_project_name: 'Kassala Health Services',
    err_code: 'ERR-KS-001',
    state: 'Kassala',
    locality: 'Kassala',
    screening_status: 'Pending',
    id_number: '19870430-005',
    date_of_birth: '1987-04-30',
    queued_at: '2026-03-09T10:30:00Z',
    risk_score: undefined,
    notes: undefined
  },
  {
    id: '6',
    full_name: 'Aisha Mohamed Osman',
    position: 'Reporting Officer',
    phone: '+249967890123',
    f1_project_id: 'f1-006',
    f1_project_name: 'North Darfur Education Support',
    err_code: 'ERR-DF-007',
    state: 'Darfur',
    locality: 'Kutum',
    screening_status: 'Cleared',
    id_number: '19950203-006',
    date_of_birth: '1995-02-03',
    queued_at: '2026-03-08T13:45:00Z',
    screened_at: '2026-03-08T16:20:00Z',
    screened_by: 'Compliance Officer 1',
    risk_score: 0,
    notes: 'No match found. Cleared for payment.'
  },
  {
    id: '7',
    full_name: 'Khalid Ibrahim Abdalla',
    position: 'Program Officer',
    phone: '+249978901234',
    f1_project_id: 'f1-007',
    f1_project_name: 'River Nile Livelihood Program',
    err_code: 'ERR-RN-002',
    state: 'River Nile',
    locality: 'Atbara',
    screening_status: 'Pending',
    id_number: '19891214-007',
    date_of_birth: '1989-12-14',
    queued_at: '2026-03-09T11:00:00Z',
    risk_score: undefined,
    notes: undefined
  },
  {
    id: '8',
    full_name: 'Hanan Ali Mohamed',
    position: 'Finance Officer',
    phone: '+249989012345',
    f1_project_id: 'f1-001',
    f1_project_name: 'Khartoum Emergency Food Distribution',
    err_code: 'ERR-KH-001',
    state: 'Khartoum',
    locality: 'Omdurman',
    screening_status: 'Cleared',
    id_number: '19930620-008',
    date_of_birth: '1993-06-20',
    queued_at: '2026-03-08T10:05:00Z',
    screened_at: '2026-03-08T14:35:00Z',
    screened_by: 'Compliance Officer 1',
    risk_score: 0,
    notes: 'No OFAC match found. Cleared for payment.'
  },
  {
    id: '9',
    full_name: 'Hassan Mohamed Al-Bashir',
    position: 'Program Officer',
    phone: '+249990123456',
    f1_project_id: 'f1-008',
    f1_project_name: 'Blue Nile Agriculture Recovery',
    err_code: 'ERR-BN-001',
    state: 'Blue Nile',
    locality: 'Damazin',
    screening_status: 'Rejected',
    id_number: '19820810-009',
    date_of_birth: '1982-08-10',
    queued_at: '2026-03-09T07:30:00Z',
    screened_at: '2026-03-09T10:15:00Z',
    screened_by: 'Compliance Officer 2',
    risk_score: 100,
    notes: 'EXACT OFAC match confirmed. SDN List #12345. Payment BLOCKED. Escalated to LoHub leadership.',
    match_details: 'Name: Exact match, DOB: Exact match (1982-08-10), ID: Match confirmed, List: OFAC SDN'
  },
  {
    id: '10',
    full_name: 'Samira Ahmed Yousif',
    position: 'Reporting Officer',
    phone: '+249901234567',
    f1_project_id: 'f1-009',
    f1_project_name: 'South Kordofan WASH Project',
    err_code: 'ERR-SK-004',
    state: 'South Kordofan',
    locality: 'Kadugli',
    screening_status: 'Pending',
    id_number: '19960925-010',
    date_of_birth: '1996-09-25',
    queued_at: '2026-03-09T11:45:00Z',
    risk_score: undefined,
    notes: undefined
  },
  {
    id: '11',
    full_name: 'Yassin Omar Ibrahim',
    position: 'Finance Officer',
    phone: '+249912345670',
    f1_project_id: 'f1-010',
    f1_project_name: 'West Darfur Peace Building',
    err_code: 'ERR-DF-009',
    state: 'Darfur',
    locality: 'Geneina',
    screening_status: 'Cleared',
    id_number: '19880305-011',
    date_of_birth: '1988-03-05',
    queued_at: '2026-03-07T16:00:00Z',
    screened_at: '2026-03-08T08:30:00Z',
    screened_by: 'Compliance Officer 2',
    risk_score: 0,
    notes: 'Prior screening from Jan 2026. Auto-linked. Cleared.'
  }
]

// Mock F1 projects with screening summaries
export interface MockF1Project {
  id: string
  err_code: string
  date: string
  state: string
  locality: string
  version: number
  funding_cycle: string
  funding_status: string
  screening_status: ScreeningStatus
  pending_count: number
  flagged_count: number
  cleared_count: number
  rejected_count: number
  total_beneficiaries: number
}

export const MOCK_F1_PROJECTS: MockF1Project[] = [
  {
    id: 'f1-001',
    err_code: 'ERR-KH-001',
    date: '2026-03-01',
    state: 'Khartoum',
    locality: 'Omdurman',
    version: 1,
    funding_cycle: 'Cycle 5',
    funding_status: 'Unassigned',
    screening_status: 'Cleared',
    pending_count: 0,
    flagged_count: 0,
    cleared_count: 3,
    rejected_count: 0,
    total_beneficiaries: 3
  },
  {
    id: 'f1-002',
    err_code: 'ERR-DF-003',
    date: '2026-03-02',
    state: 'Darfur',
    locality: 'El Fasher',
    version: 1,
    funding_cycle: 'Cycle 5',
    funding_status: 'Unassigned',
    screening_status: 'Pending',
    pending_count: 1,
    flagged_count: 0,
    cleared_count: 0,
    rejected_count: 0,
    total_beneficiaries: 1
  },
  {
    id: 'f1-003',
    err_code: 'ERR-GZ-005',
    date: '2026-03-03',
    state: 'Gezira',
    locality: 'Wad Madani',
    version: 1,
    funding_cycle: 'Cycle 5',
    funding_status: 'Unassigned',
    screening_status: 'Flagged',
    pending_count: 0,
    flagged_count: 1,
    cleared_count: 2,
    rejected_count: 0,
    total_beneficiaries: 3
  },
  {
    id: 'f1-008',
    err_code: 'ERR-BN-001',
    date: '2026-03-04',
    state: 'Blue Nile',
    locality: 'Damazin',
    version: 1,
    funding_cycle: 'Cycle 5',
    funding_status: 'Unassigned',
    screening_status: 'Rejected',
    pending_count: 0,
    flagged_count: 0,
    cleared_count: 2,
    rejected_count: 1,
    total_beneficiaries: 3
  }
]
