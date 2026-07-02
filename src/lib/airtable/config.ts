export const AIRTABLE_BASE_ID = 'appq9qjlnEW7d0tqZ'
export const AIRTABLE_TOKEN_ENV = 'Airtable_Personal_Access_Token'

export const PORTAL_AIRTABLE_TABLES = {
  GRANTS: 'Portal_Grants',
  DECISIONS: 'Portal_Decisions',
  ALLOCATIONS: 'Portal_Allocations',
} as const

export function getAirtableToken(): string {
  const token = process.env[AIRTABLE_TOKEN_ENV]
  if (!token) {
    throw new Error(`Missing ${AIRTABLE_TOKEN_ENV} environment variable`)
  }
  return token
}

export function isAirtablePushConfigured(): boolean {
  return Boolean(process.env[AIRTABLE_TOKEN_ENV]?.trim())
}
