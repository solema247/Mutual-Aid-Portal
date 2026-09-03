import { NextResponse } from 'next/server'
import { z } from 'zod'
import { assertPermission, getRouteHandlerAuth } from '@/lib/routeHandlerAuth'
import {
  DEFAULT_GITHUB_ISSUES_REPO,
  GITHUB_RAISE_TICKET_LABELS,
  PRIORITY_TO_DESCRIPTION_LINE,
  RAISE_TICKET_PRIORITIES,
} from '@/lib/raiseTicketGithub'
import { checkRaiseTicketRateLimit } from '@/lib/rateLimitSlidingWindow'
import {
  RAISE_TICKET_IMAGE_MAX_BYTES,
  RAISE_TICKET_IMAGE_MAX_COUNT,
  formatGithubIssueAttachmentsMarkdown,
  isAllowedRaiseTicketImageMime,
  uploadGithubIssueAttachment,
  type GithubIssueAttachment,
  type RaiseTicketImageMime,
} from '@/lib/githubIssueAttachments'

const fieldsSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().min(10).max(8000),
    label: z.enum(GITHUB_RAISE_TICKET_LABELS),
    priority: z.enum(RAISE_TICKET_PRIORITIES),
  })
  .strict()

const DEFAULT_REPO = DEFAULT_GITHUB_ISSUES_REPO

async function parseMultipartFields (form: FormData) {
  return fieldsSchema.safeParse({
    title: String(form.get('title') ?? ''),
    description: String(form.get('description') ?? ''),
    label: String(form.get('label') ?? ''),
    priority: String(form.get('priority') ?? ''),
  })
}

function collectImageFiles (form: FormData): File[] {
  const fromAll = form.getAll('images').filter((v): v is File => v instanceof File && v.size > 0)
  if (fromAll.length > 0) return fromAll
  const single = form.get('image')
  if (single instanceof File && single.size > 0) return [single]
  return []
}

export async function POST (request: Request) {
  try {
    const auth = await getRouteHandlerAuth()
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: userRow, error: userErr } = await auth.supabase
      .from('users')
      .select('display_name, status')
      .eq('id', auth.dbUser.id)
      .single()

    if (userErr || !userRow || userRow.status !== 'active') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    assertPermission(auth, 'raise_ticket_page')

    const token = process.env.GITHUB_ISSUES_TOKEN ?? process.env.GITHUB_TOKEN
    if (!token) {
      return NextResponse.json(
        { error: 'GitHub integration is not configured on this server.' },
        { status: 503 }
      )
    }

    const contentType = request.headers.get('content-type') ?? ''
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json(
        { error: 'Expected multipart/form-data' },
        { status: 400 }
      )
    }

    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
    }

    const parsed = await parseMultipartFields(form)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      )
    }

    const imageFiles = collectImageFiles(form)
    if (imageFiles.length > RAISE_TICKET_IMAGE_MAX_COUNT) {
      return NextResponse.json(
        {
          error: `Too many images (max ${RAISE_TICKET_IMAGE_MAX_COUNT}).`,
        },
        { status: 400 }
      )
    }

    for (const file of imageFiles) {
      if (!isAllowedRaiseTicketImageMime(file.type)) {
        return NextResponse.json(
          {
            error: `Unsupported image type: ${file.type || 'unknown'}. Use PNG, JPEG, WebP, or GIF.`,
          },
          { status: 400 }
        )
      }
      if (file.size > RAISE_TICKET_IMAGE_MAX_BYTES) {
        return NextResponse.json(
          {
            error: `Image "${file.name}" exceeds the ${Math.round(RAISE_TICKET_IMAGE_MAX_BYTES / (1024 * 1024))} MB limit.`,
          },
          { status: 400 }
        )
      }
    }

    const rate = checkRaiseTicketRateLimit(auth.dbUser.id)
    if (!rate.ok) {
      return NextResponse.json(
        {
          error: 'Too many ticket submissions. Please try again later.',
          retryAfter: rate.retryAfterSec,
        },
        {
          status: 429,
          headers: { 'Retry-After': String(rate.retryAfterSec) },
        }
      )
    }

    const { title, description, label, priority } = parsed.data
    const repo = process.env.GITHUB_ISSUES_REPO ?? DEFAULT_REPO

    const attachments: GithubIssueAttachment[] = []
    for (const file of imageFiles) {
      try {
        const bytes = await file.arrayBuffer()
        const uploaded = await uploadGithubIssueAttachment({
          token,
          repo,
          filename: file.name || 'image.png',
          contentType: file.type as RaiseTicketImageMime,
          bytes,
        })
        attachments.push(uploaded)
      } catch (uploadErr) {
        console.error('GitHub attachment upload failed:', uploadErr)
        const detail =
          uploadErr instanceof Error ? uploadErr.message : 'Upload failed'
        return NextResponse.json(
          {
            error: 'Could not upload image to GitHub. Ticket was not created.',
            detail,
          },
          { status: 502 }
        )
      }
    }

    const priorityLine = PRIORITY_TO_DESCRIPTION_LINE[priority]
    const attachmentsMd = formatGithubIssueAttachmentsMarkdown(attachments)

    const issueBody = [
      '## Report from Mutual Aid Portal',
      '',
      `**Reporter:** ${userRow.display_name ?? '(unknown)'}`,
      '',
      '### Description',
      '',
      `**Priority:** ${priorityLine}`,
      '',
      description,
      '',
      ...(attachmentsMd ? [attachmentsMd] : []),
      '---',
      '_Submitted via ERR portal → Raise a ticket_',
    ].join('\n')

    const ghRes = await fetch(`https://api.github.com/repos/${repo}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title,
        body: issueBody,
        labels: [label],
      }),
    })

    const ghJson: unknown = await ghRes.json().catch(() => null)

    if (!ghRes.ok) {
      const msg =
        ghJson &&
        typeof ghJson === 'object' &&
        'message' in ghJson &&
        typeof (ghJson as { message?: string }).message === 'string'
          ? (ghJson as { message: string }).message
          : `GitHub returned ${ghRes.status}`
      console.error('GitHub issues API error:', ghRes.status, msg)
      return NextResponse.json(
        { error: 'Could not create GitHub issue', detail: msg },
        { status: 502 }
      )
    }

    const htmlUrl =
      ghJson &&
      typeof ghJson === 'object' &&
      'html_url' in ghJson &&
      typeof (ghJson as { html_url?: string }).html_url === 'string'
        ? (ghJson as { html_url: string }).html_url
        : undefined
    const number =
      ghJson &&
      typeof ghJson === 'object' &&
      'number' in ghJson &&
      typeof (ghJson as { number?: number }).number === 'number'
        ? (ghJson as { number: number }).number
        : undefined

    return NextResponse.json({ html_url: htmlUrl, number })
  } catch (e) {
    const status = (e as Error & { statusCode?: number })?.statusCode
    if (status === 403) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    console.error('POST /api/support/github-issue:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
