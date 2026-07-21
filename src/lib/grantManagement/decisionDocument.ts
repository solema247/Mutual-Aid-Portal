/**
 * Decision document attachments (portal multi-file + Airtable single link).
 * Stored in distribution_decision_master_sheet_1.decision_documents (jsonb).
 * file_name / file_link stay as the primary (first) doc for Airtable sync.
 */

export type DecisionDocument = {
  id: string
  file_name: string
  file_link: string
  source?: 'airtable' | 'portal' | string
  uploaded_at?: string
}

/** External links (typically Google Drive from Airtable) vs portal storage paths. */
export function isExternalDecisionDocLink(link: string): boolean {
  return /^https?:\/\//i.test(link.trim())
}

export function createDecisionDocumentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `doc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function asDocument(raw: unknown): DecisionDocument | null {
  if (!raw || typeof raw !== 'object') return null
  const obj = raw as Record<string, unknown>
  const file_link = typeof obj.file_link === 'string' ? obj.file_link.trim() : ''
  if (!file_link) return null
  const file_name =
    typeof obj.file_name === 'string' && obj.file_name.trim()
      ? obj.file_name.trim()
      : 'Document'
  const id =
    typeof obj.id === 'string' && obj.id.trim()
      ? obj.id.trim()
      : createDecisionDocumentId()
  return {
    id,
    file_name,
    file_link,
    source: typeof obj.source === 'string' ? obj.source : undefined,
    uploaded_at: typeof obj.uploaded_at === 'string' ? obj.uploaded_at : undefined,
  }
}

/** Normalize DB row into a documents list; falls back to legacy file_name/file_link. */
export function normalizeDecisionDocuments(row: {
  decision_documents?: unknown
  file_name?: string | null
  file_link?: string | null
}): DecisionDocument[] {
  const raw = row.decision_documents
  if (Array.isArray(raw) && raw.length > 0) {
    return raw.map(asDocument).filter((d): d is DecisionDocument => Boolean(d))
  }
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(asDocument).filter((d): d is DecisionDocument => Boolean(d))
      }
    } catch {
      /* ignore */
    }
  }

  const link = row.file_link?.trim()
  if (!link) return []
  return [
    {
      id: createDecisionDocumentId(),
      file_name: row.file_name?.trim() || 'Document',
      file_link: link,
      source: isExternalDecisionDocLink(link) ? 'airtable' : 'portal',
    },
  ]
}

export function primaryFileFields(docs: DecisionDocument[]): {
  file_name: string | null
  file_link: string | null
} {
  const first = docs[0]
  if (!first) return { file_name: null, file_link: null }
  return { file_name: first.file_name, file_link: first.file_link }
}

export function buildDecisionDocument(input: {
  file_name: string
  file_link: string
  source?: DecisionDocument['source']
}): DecisionDocument {
  return {
    id: createDecisionDocumentId(),
    file_name: input.file_name.trim() || 'Document',
    file_link: input.file_link.trim(),
    source: input.source ?? (isExternalDecisionDocLink(input.file_link) ? 'airtable' : 'portal'),
    uploaded_at: new Date().toISOString(),
  }
}

/**
 * Resolve a decision document to an openable URL.
 * - http(s) links (Airtable / Drive): returned as-is
 * - storage paths (e.g. f0-distribution-decisions/...): signed URL via /api/storage/signed-url
 */
export async function resolveDecisionDocumentUrl(
  fileLink: string | null | undefined
): Promise<string | null> {
  if (!fileLink?.trim()) return null
  const link = fileLink.trim()
  if (isExternalDecisionDocLink(link)) return link

  const params = new URLSearchParams({ bucket: 'images', path: link })
  const res = await fetch(`/api/storage/signed-url?${params.toString()}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to resolve document URL')
  }
  const data = await res.json()
  return typeof data.url === 'string' ? data.url : null
}
