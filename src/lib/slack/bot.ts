import OpenAI from 'openai'
import { WebClient } from '@slack/web-api'
import { getOpenAIApiKey } from '@/lib/getOpenAIApiKey'
import { TOOLS, executeTool } from './tools'
import { PORTAL_FAQ } from './faq'

const SYSTEM_PROMPT = `
You are a helpful assistant for the Mutual Aid Sudan ERR (Emergency Response Room) Portal.
You help portal users — programme coordinators, finance staff, and partners — answer questions
about the portal data, dashboards, and how to use the portal.

You have access to live portal data through the tools provided. Use them when the user asks
about specific numbers, statistics, or data from the portal. For general questions about how
the portal works, use the FAQ knowledge base below.

## Guidelines
- Be concise and direct. Use bullet points or short tables for data responses.
- Format numbers with commas (e.g. 1,234) and round USD amounts to whole dollars.
- When showing percentages, include the % sign.
- If a question is about a specific state or grant, use the relevant filter in the tool call.
- If you cannot answer a question with the available data, say so clearly and suggest who to contact.
- Do not make up data. Only report what the tools return.
- Respond in the same language the user wrote in (English or Arabic). If Arabic, still use
  English for numbers and technical field names.

## Portal FAQ Knowledge Base
${PORTAL_FAQ}
`.trim()

function getClients() {
  const apiKey = getOpenAIApiKey()
  if (!apiKey) throw new Error('OpenAI API key not configured')

  const slackToken = process.env.SLACK_BOT_TOKEN
  if (!slackToken) throw new Error('SLACK_BOT_TOKEN not configured')

  return {
    openai: new OpenAI({ apiKey }),
    slack: new WebClient(slackToken),
  }
}

/** Strip the bot's @mention from the beginning of a message */
function stripBotMention(text: string): string {
  return text.replace(/^<@[A-Z0-9]+>\s*/i, '').trim()
}

/** Run the OpenAI agentic loop: call tools until the model returns a final answer */
async function runAgentLoop(
  openai: OpenAI,
  userMessage: string
): Promise<string> {
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userMessage },
  ]

  for (let i = 0; i < 5; i++) {
    const response = await openai.chat.completions.create({
      model: process.env.SLACK_BOT_MODEL || 'gpt-4o-mini',
      messages,
      tools: TOOLS,
      tool_choice: 'auto',
      temperature: 0.3,
      max_tokens: 1024,
    })

    const choice = response.choices[0]

    if (choice.finish_reason === 'stop' || !choice.message.tool_calls?.length) {
      return choice.message.content || 'I was unable to find an answer to that question.'
    }

    // Process tool calls
    messages.push(choice.message)

    for (const toolCall of choice.message.tool_calls) {
      if (toolCall.type !== 'function') continue

      let result: unknown
      try {
        const args = JSON.parse(toolCall.function.arguments || '{}')
        result = await executeTool(toolCall.function.name, args)
      } catch (err) {
        result = { error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}` }
      }

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }

  return 'I reached the maximum number of steps. Please try a more specific question.'
}

/** Main entry point: process a Slack message and post the reply */
export async function handleSlackMessage(payload: {
  channel: string
  thread_ts?: string
  text: string
  user: string
}): Promise<void> {
  const { openai, slack } = getClients()

  const userMessage = stripBotMention(payload.text)
  if (!userMessage) return

  // Post a "thinking" indicator
  const thinkingMsg = await slack.chat.postMessage({
    channel: payload.channel,
    thread_ts: payload.thread_ts,
    text: '🔍 Looking into that...',
  })

  try {
    const answer = await runAgentLoop(openai, userMessage)

    // Replace the thinking message with the real answer
    if (thinkingMsg.ts) {
      await slack.chat.update({
        channel: payload.channel,
        ts: thinkingMsg.ts,
        text: answer,
      })
    } else {
      await slack.chat.postMessage({
        channel: payload.channel,
        thread_ts: payload.thread_ts,
        text: answer,
      })
    }
  } catch (err) {
    const errMsg =
      err instanceof Error ? err.message : 'An unexpected error occurred.'
    console.error('[slack-bot] Error processing message:', err)

    const fallback =
      `⚠️ Sorry, I ran into an error: ${errMsg}\n\n` +
      'Please try again or contact your programme coordinator for help.'

    if (thinkingMsg.ts) {
      await slack.chat.update({
        channel: payload.channel,
        ts: thinkingMsg.ts,
        text: fallback,
      })
    }
  }
}
