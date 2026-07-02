import { AIRTABLE_BASE_ID, getAirtableToken } from '@/lib/airtable/config'

export type AirtableFields = Record<string, unknown>

type AirtableRecordResponse = {
  records: Array<{ id: string; fields: AirtableFields }>
}

function apiUrl(tableName: string, query?: string): string {
  const base = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${encodeURIComponent(tableName)}`
  return query ? `${base}?${query}` : base
}

async function airtableFetch(
  tableName: string,
  init: RequestInit & { query?: string }
): Promise<Response> {
  const token = getAirtableToken()
  const { query, ...rest } = init
  return fetch(apiUrl(tableName, query), {
    ...rest,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(rest.headers ?? {}),
    },
  })
}

export async function createAirtableRecord(
  tableName: string,
  fields: AirtableFields
): Promise<string> {
  const res = await airtableFetch(tableName, {
    method: 'POST',
    body: JSON.stringify({ records: [{ fields }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable create failed (${tableName}): ${res.status} ${body}`)
  }
  const data = (await res.json()) as AirtableRecordResponse
  const id = data.records?.[0]?.id
  if (!id) throw new Error(`Airtable create returned no record id (${tableName})`)
  return id
}

export async function updateAirtableRecord(
  tableName: string,
  recordId: string,
  fields: AirtableFields
): Promise<void> {
  const res = await airtableFetch(tableName, {
    method: 'PATCH',
    body: JSON.stringify({ records: [{ id: recordId, fields }] }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Airtable update failed (${tableName}/${recordId}): ${res.status} ${body}`)
  }
}

export async function deleteAirtableRecords(tableName: string, recordIds: string[]): Promise<void> {
  if (!recordIds.length) return
  const chunks: string[][] = []
  for (let i = 0; i < recordIds.length; i += 10) {
    chunks.push(recordIds.slice(i, i + 10))
  }
  for (const chunk of chunks) {
    const query = chunk.map((id) => `records[]=${encodeURIComponent(id)}`).join('&')
    const res = await airtableFetch(tableName, { method: 'DELETE', query })
    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Airtable delete failed (${tableName}): ${res.status} ${body}`)
    }
  }
}
