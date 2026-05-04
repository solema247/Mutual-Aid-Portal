/**
 * In-memory sliding-window rate limiter (per Node process).
 * For multi-instance deployments each instance enforces its own window; use Redis/Upstash for global limits.
 */

type TimestampStore = Map<string, number[]>

const stores = new Map<string, TimestampStore>()

function getStore (namespace: string): TimestampStore {
  let s = stores.get(namespace)
  if (!s) {
    s = new Map()
    stores.set(namespace, s)
  }
  return s
}

export type RateLimitResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number }

function parsePositiveInt (value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/**
 * At most `max` hits allowed per `windowMs` sliding window per `key`.
 */
export function slidingWindowRateLimit (
  namespace: string,
  key: string,
  max: number,
  windowMs: number
): RateLimitResult {
  const now = Date.now()
  const cutoff = now - windowMs
  const store = getStore(namespace)
  const stamps = store.get(key) ?? []
  const recent = stamps.filter((t) => t > cutoff)

  if (recent.length >= max) {
    const oldest = recent.reduce((a, b) => Math.min(a, b))
    const retryAfterMs = oldest + windowMs - now
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000))
    store.set(key, recent)
    return { ok: false, retryAfterSec }
  }

  recent.push(now)
  store.set(key, recent)
  return { ok: true }
}

/** Raise-a-ticket API: defaults 10 submissions per user per hour (overridable via env). */
export function checkRaiseTicketRateLimit (userId: string): RateLimitResult {
  const max = parsePositiveInt(process.env.RAISE_TICKET_RATE_LIMIT_MAX, 10)
  const windowMs = parsePositiveInt(
    process.env.RAISE_TICKET_RATE_LIMIT_WINDOW_MS,
    60 * 60 * 1000
  )
  return slidingWindowRateLimit('raise-ticket-github-issue', userId, max, windowMs)
}
