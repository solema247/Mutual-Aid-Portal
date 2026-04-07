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

  if (!channelId) {
    return Response.json({ response_type: 'ephemeral', text: '⚠️ Could not determine channel.' })
  }

  // ── /delete-last ───────────────────────────────────────────────────────────
  if (command === '/delete-last') {
    // Respond immediately so Slack doesn't show a timeout error.
    // The actual deletion runs asynchronously and posts an ephemeral confirmation.
    deleteLastBotMessage(channelId).catch(console.error)

    // Acknowledge the command instantly
    return Response.json({
      response_type: 'ephemeral',
      text: '🗑️ Looking for my last message to delete...',
    })
  }

  return Response.json({
    response_type: 'ephemeral',
    text: `Unknown command: ${command}`,
  })
}

/** Finds and deletes the most recent message posted by this bot in the channel */
async function deleteLastBotMessage(channelId: string): Promise<void> {
  const slack = getSlackClient()

  // Get this bot's own ID so we only delete our own messages
  const auth = await slack.auth.test()
  const botUserId = auth.user_id

  // Fetch recent channel history
  const history = await slack.conversations.history({
    channel: channelId,
    limit: 50,
  })

  // Find the most recent message posted by our bot
  const botMessage = (history.messages || []).find(
    (msg) => msg.bot_id && msg.user === botUserId
  )

  if (!botMessage?.ts) {
    // Post ephemeral "nothing to delete" message
    await slack.chat.postEphemeral({
      channel: channelId,
      // We don't have user_id here, so post to channel as bot
      // Fall back to posting a temporary visible message
      user: botUserId || '',
      text: 'ℹ️ I couldn\'t find any recent messages from me in this channel.',
    }).catch(async () => {
      // If ephemeral fails (no user_id), post and auto-schedule delete
      const msg = await slack.chat.postMessage({
        channel: channelId,
        text: 'ℹ️ No recent messages from me found to delete.',
      })
      // Auto-delete this notification after 5 seconds
      if (msg.ts) {
        setTimeout(async () => {
          await slack.chat.delete({ channel: channelId, ts: msg.ts! }).catch(() => {})
        }, 5000)
      }
    })
    return
  }

  // Delete the found message
  await slack.chat.delete({
    channel: channelId,
    ts: botMessage.ts,
  })
}
