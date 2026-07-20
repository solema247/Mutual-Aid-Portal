/**
 * Best-effort Slack alert for sanctions-match flags.
 * Uses SLACK_BOT_TOKEN. Optional COMPLIANCE_ALERT_SLACK_CHANNEL (e.g. C0123...).
 * If no channel is configured, logs the alert payload and returns false.
 */
export async function sendSanctionsMatchAlert(payload: {
  errId: string | null
  projectId: string
  names: string[]
  note: string | null
  screeningId: string
}): Promise<{ sent: boolean; detail: string }> {
  const token = process.env.SLACK_BOT_TOKEN
  const channel = process.env.COMPLIANCE_ALERT_SLACK_CHANNEL

  const text = [
    ':rotating_light: *COMPLIANCE RED ALERT — PAYMENT MUST BE STOPPED*',
    '',
    `*F1 / ERR ID:* ${payload.errId || payload.projectId}`,
    `*Payee names:* ${(payload.names || []).join(', ') || '—'}`,
    `*Flag:* Potential Descartes / sanctions list match`,
    payload.note ? `*Ahmed's note:* ${payload.note}` : null,
    '',
    '_Notify: Finance team, Ahmed, Yara, Josh, Nihal, Santiago_',
    `_Screening ID: ${payload.screeningId}_`
  ]
    .filter(Boolean)
    .join('\n')

  if (!token) {
    console.warn('[compliance-alert] SLACK_BOT_TOKEN not set; alert not sent to Slack')
    console.warn('[compliance-alert]', text)
    return { sent: false, detail: 'Slack token not configured — in-app alert only' }
  }
  if (!channel) {
    console.warn('[compliance-alert] COMPLIANCE_ALERT_SLACK_CHANNEL not set; alert not sent to Slack')
    console.warn('[compliance-alert]', text)
    return { sent: false, detail: 'Slack channel not configured — in-app alert only' }
  }

  try {
    const res = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        channel,
        text,
        unfurl_links: false
      })
    })
    const data = await res.json()
    if (!data.ok) {
      console.error('[compliance-alert] Slack API error:', data.error)
      return { sent: false, detail: `Slack error: ${data.error}` }
    }
    return { sent: true, detail: 'Slack alert sent' }
  } catch (e) {
    console.error('[compliance-alert] Failed to post to Slack:', e)
    return { sent: false, detail: 'Slack request failed' }
  }
}
