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

/** Finds and deletes the most recent message posted by this bot —
 *  checks both top-level channel messages and replies inside threads */
async function deleteLastBotMessage(channelId: string, userId: string): Promise<void> {
  const slack = getSlackClient()

  // Get this bot's own bot_id (B... format) — the reliable identifier on bot messages
  const auth = await slack.auth.test()
  const botId = auth.bot_id

  // Fetch recent top-level channel messages
  const history = await slack.conversations.history({
    channel: channelId,
    limit: 30,
  })

  const topLevelMessages = history.messages || []

  // Also collect all thread replies for messages that have a thread
  // (the bot replies inside threads, so conversations.history alone won't find them)
  const threadedMessages: Array<{ ts: string; thread_ts: string; bot_id?: string }> = []

  const threadsToCheck = topLevelMessages
    .filter((msg) => msg.reply_count && msg.reply_count > 0 && msg.ts)
    .slice(0, 10) // check the 10 most recent threads

  await Promise.all(
    threadsToCheck.map(async (msg) => {
      try {
        const replies = await slack.conversations.replies({
          channel: channelId,
          ts: msg.ts!,
        })
        for (const reply of replies.messages || []) {
          if (reply.bot_id && reply.ts && reply.ts !== msg.ts) {
            threadedMessages.push({
              ts: reply.ts,
              thread_ts: msg.ts!,
              bot_id: reply.bot_id,
            })
          }
        }
      } catch {
        // ignore errors for individual threads
      }
    })
  )

  // Find the most recent bot message across top-level + all thread replies
  // Sort everything by ts (timestamp) descending to get the latest
  type Candidate = { ts: string; thread_ts?: string }
  const allBotMessages: Candidate[] = []

  for (const msg of topLevelMessages) {
    if (msg.bot_id === botId && msg.ts) {
      allBotMessages.push({ ts: msg.ts })
    }
  }
  for (const reply of threadedMessages) {
    if (reply.bot_id === botId) {
      allBotMessages.push({ ts: reply.ts, thread_ts: reply.thread_ts })
    }
  }

  // Sort descending by ts (Slack ts values are Unix timestamps as strings)
  allBotMessages.sort((a, b) => parseFloat(b.ts) - parseFloat(a.ts))

  const target = allBotMessages[0]

  if (!target) {
    await slack.chat.postEphemeral({
      channel: channelId,
      user: userId,
      text: 'ℹ️ I couldn\'t find any recent messages from me in this channel.',
    }).catch(() => {})
    return
  }

  await slack.chat.delete({
    channel: channelId,
    ts: target.ts,
  })
}
