/**
 * Upload images to GitHub user-attachments for embedding in issues.
 * Uses the same uploads.github.com flow as `gh issue create --attach`.
 */

export const RAISE_TICKET_IMAGE_MAX_COUNT = 3
export const RAISE_TICKET_IMAGE_MAX_BYTES = 5 * 1024 * 1024
export const RAISE_TICKET_IMAGE_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export type RaiseTicketImageMime = (typeof RAISE_TICKET_IMAGE_MIME_TYPES)[number]

const GH_API_HEADERS = {
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
} as const

const repoIdCache = new Map<string, number>()

export function isAllowedRaiseTicketImageMime (mime: string): mime is RaiseTicketImageMime {
  return (RAISE_TICKET_IMAGE_MIME_TYPES as readonly string[]).includes(mime)
}

export async function getGithubRepositoryId (
  repo: string,
  token: string
): Promise<number> {
  const cached = repoIdCache.get(repo)
  if (cached != null) return cached

  const res = await fetch(`https://api.github.com/repos/${repo}`, {
    headers: {
      ...GH_API_HEADERS,
      Authorization: `Bearer ${token}`,
    },
  })
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      json &&
      typeof json === 'object' &&
      'message' in json &&
      typeof (json as { message?: string }).message === 'string'
        ? (json as { message: string }).message
        : `GitHub returned ${res.status}`
    throw new Error(`Could not resolve repository id: ${msg}`)
  }
  const id =
    json &&
    typeof json === 'object' &&
    'id' in json &&
    typeof (json as { id?: number }).id === 'number'
      ? (json as { id: number }).id
      : null
  if (id == null) {
    throw new Error('Could not resolve repository id: missing id in response')
  }
  repoIdCache.set(repo, id)
  return id
}

function extractAttachmentUrl (json: unknown): string | null {
  if (!json || typeof json !== 'object') return null
  const obj = json as Record<string, unknown>
  if (typeof obj.url === 'string' && obj.url.length > 0) return obj.url
  if (typeof obj.href === 'string' && obj.href.length > 0) return obj.href
  if (obj.asset && typeof obj.asset === 'object') {
    const asset = obj.asset as Record<string, unknown>
    if (typeof asset.href === 'string' && asset.href.length > 0) return asset.href
    if (typeof asset.url === 'string' && asset.url.length > 0) return asset.url
  }
  return null
}

export type GithubIssueAttachment = {
  filename: string
  url: string
}

/**
 * Upload a single image to GitHub user-attachments and return its public URL.
 */
export async function uploadGithubIssueAttachment (opts: {
  token: string
  repo: string
  filename: string
  contentType: RaiseTicketImageMime
  bytes: ArrayBuffer | Uint8Array
}): Promise<GithubIssueAttachment> {
  const repositoryId = await getGithubRepositoryId(opts.repo, opts.token)
  const safeName = opts.filename.replace(/[^\w.\-()+ ]+/g, '_') || 'image.png'
  const qs = new URLSearchParams({
    name: safeName,
    content_type: opts.contentType,
    repository_id: String(repositoryId),
  })
  const res = await fetch(
    `https://uploads.github.com/user-attachments/assets?${qs.toString()}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${opts.token}`,
        Accept: 'application/json',
        'Content-Type': opts.contentType,
      },
      body: new Blob([opts.bytes], { type: opts.contentType }),
    }
  )
  const json: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const msg =
      json &&
      typeof json === 'object' &&
      'message' in json &&
      typeof (json as { message?: string }).message === 'string'
        ? (json as { message: string }).message
        : `GitHub uploads returned ${res.status}`
    throw new Error(msg)
  }
  const url = extractAttachmentUrl(json)
  if (!url) {
    throw new Error('GitHub uploads response missing attachment URL')
  }
  return { filename: safeName, url }
}

export function formatGithubIssueAttachmentsMarkdown (
  attachments: GithubIssueAttachment[]
): string {
  if (attachments.length === 0) return ''
  const lines = ['### Attachments', '']
  for (const a of attachments) {
    const alt = a.filename.replace(/[[\]]/g, '')
    lines.push(`![${alt}](${a.url})`)
    lines.push('')
  }
  return lines.join('\n')
}
