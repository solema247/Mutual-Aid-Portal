/** External links (typically Google Drive from Airtable) vs portal storage paths. */
export function isExternalDecisionDocLink(link: string): boolean {
  return /^https?:\/\//i.test(link.trim())
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
