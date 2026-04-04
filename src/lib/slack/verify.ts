import crypto from 'crypto'

/**
 * Verifies that an incoming request genuinely came from Slack using HMAC-SHA256.
 * Rejects requests older than 5 minutes to prevent replay attacks.
 */
export function verifySlackSignature(
  signingSecret: string,
  signature: string | null,
  timestamp: string | null,
  body: string
): boolean {
  if (!signature || !timestamp) return false

  const ts = parseInt(timestamp, 10)
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300
  if (ts < fiveMinutesAgo) return false

  const sigBasestring = `v0:${timestamp}:${body}`
  const computed = `v0=${crypto
    .createHmac('sha256', signingSecret)
    .update(sigBasestring, 'utf8')
    .digest('hex')}`

  try {
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'utf8'),
      Buffer.from(signature, 'utf8')
    )
  } catch {
    return false
  }
}
