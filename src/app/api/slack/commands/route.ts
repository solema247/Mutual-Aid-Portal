import { waitUntil } from '@vercel/functions'
import { WebClient } from '@slack/web-api'
import { verifySlackSignature } from '@/lib/slack/verify'

export const dynamic = 'force-dynamic'

function getSlackClient(): WebClient {
  const token = process.env.SLACK_BOT_TOKEN
  if (!token) throw new Error('SLACK_BOT_TOKEN not configured')
  return new WebClient(token)
}

/**
 * POST /api/slack/commands
 * Handles Slack slash commands. Slack sends URL-encoded form data.
 */
export async function POST(request: Request) {
  const body = await request.text()

  // ── Signature verification ─────────────────────────────────────────────────
  const signingSecret = process.env.SLACK_SIGNING_SECRET
  if (!signingSecret) {
    return new Response('Server misconfigured', { status: 500 })
  }

  const signature = request.headers.get('x-slack-signature')
  const timestamp = request.headers.get('x-slack-request-timestamp')

  if (!verifySlackSignature(signingSecret, signature, timestamp, body)) {
    return new Response('Invalid signature', { status: 401 })
  }

  // ── Parse URL-encoded payload from Slack ───────────────────────────────────
  const params = new URLSearchParams(body)
  const command = params.get('command')
  const channelId = params.get('channel_id')
  const userId = params.get('user_id') || ''

  if (!channelId) {
    return Response.json({ response_type: 'ephemeral', text: '⚠️ Could not determine channel.' })
  }

  // ── /delete-last ───────────────────────────────────────────────────────────
  if (command === '/delete-last') {
    // Use waitUntil so the async deletion keeps running after the response is sent
    waitUntil(deleteLastBotMessage(channelId, userId))

    // Acknowledge instantly — Slack requires a response within 3 seconds
    return Response.json({
      response_type: 'ephemeral',
      text: '🗑️ Deleting my last message...',
    })
  }

  return Response.json({
    response_type: 'ephemeral',
    text: `Unknown command: ${command}`,
  })
}

/** Finds and deletes the most recent message posted by this bot in the channel */
async function deleteLastBotMessage(channelId: string, userId: string): Promise<void> {
  const slack = getSlackClient()

  // Get this bot's own bot_id (B... format) — the reliable identifier on bot messages
  const auth = await slack.auth.test()
  const botId = auth.bot_id

  // Fetch recent channel history
  const history = await slack.conversations.history({
    channel: channelId,
    limit: 50,
  })

  // Match by bot_id — this is the consistent field on every message posted by this app
  const botMessage = (history.messages || []).find(
    (msg) => msg.bot_id === botId
  )

  if (!botMessage?.ts) {
    await slack.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: 'ℹ️ I couldn\'t find any recent messages from me in this channel.',
    }).catch(() => {})
    return
  }

  await slack.chat.delete({
    channel: channelId,
    ts: botMessage.ts,
  })
}
