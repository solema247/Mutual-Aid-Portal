import { waitUntil } from '@vercel/functions'
import { verifySlackSignature } from '@/lib/slack/verify'
import { handleSlackMessage } from '@/lib/slack/bot'

export const dynamic = 'force-dynamic'

// Seen event IDs — prevents Slack's 3-retry mechanism from processing duplicates.
// In-memory cache is fine here; duplicates are harmless but wasteful.
const seenEventIds = new Set<string>()

export async function POST(request: Request) {
  const body = await request.text()

  // ── Signature verification ─────────────────────────────────────────────────
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    console.error('[slack/events] SLACK_SIGNING_SECRET not set')
    return new Response('Server misconfigured', { status: 500 })
  }

  const signature = request.headers.get('x-slack-signature')
  const timestamp = request.headers.get('x-slack-request-timestamp')

  if (!verifySlackSignature(signingSecret, signature, timestamp, body)) {
    return new Response('Invalid signature', { status: 401 })
  }

  // ── Parse payload ─────────────────────────────────────────────────────────
  let payload: Record<string, unknown>
  try {
    payload = JSON.parse(body)
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  // ── URL verification challenge (one-time Slack setup handshake) ────────────
  if (payload.type === 'url_verification') {
    return Response.json({ challenge: payload.challenge })
  }

  // ── Deduplicate retried events ─────────────────────────────────────────────
  const event = payload.event as Record<string, unknown> | undefined
  const eventId = payload.event_id as string | undefined

  if (eventId) {
    if (seenEventIds.has(eventId)) {
      return new Response('OK', { status: 200 })
    }
    seenEventIds.add(eventId)
    // Prune cache after 1000 entries to avoid unbounded growth
    if (seenEventIds.size > 1000) {
      const first = seenEventIds.values().next().value
      if (first) seenEventIds.delete(first)
    }
  }

  // ── Immediately acknowledge Slack (must be within 3 seconds) ───────────────
  // Processing happens asynchronously via waitUntil so the function stays
  // alive on Vercel after the response is sent.

  if (!event) {
    return new Response('OK', { status: 200 })
  }

  const eventType = event.type as string
  const botId = event.bot_id as string | undefined

  // Ignore messages from bots (including ourselves) to prevent loops
  if (botId || eventType === 'message' && (event.subtype as string | undefined)) {
    return new Response('OK', { status: 200 })
  }

  // Handle app_mention (when someone @-mentions the bot) and
  // direct messages (message events in im channel type)
  if (eventType === 'app_mention' || eventType === 'message') {
    const text = (event.text as string | undefined) || ''
    const channel = (event.channel as string | undefined) || ''
    const user = (event.user as string | undefined) || ''
    const threadTs = (event.thread_ts as string | undefined) || (event.ts as string | undefined)

    if (!text || !channel || !user) {
      return new Response('OK', { status: 200 })
    }

    waitUntil(
      handleSlackMessage({ channel, thread_ts: threadTs, text, user })
    )
  }

  return new Response('OK', { status: 200 })
}
