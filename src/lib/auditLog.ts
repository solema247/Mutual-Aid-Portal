/**
 * Portal Audit Log — server-side foundation (Phase 2).
 *
 * Writes go through the service-role client only. Do not import this module
 * from client components. See docs/AUDIT_LOG.md for event taxonomy.
 *
 * IMPORTANT: Silent permission seeding (e.g. GET /api/permissions/overview)
 * must NOT be logged as a user-initiated audit action.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Known audit actions (user mgmt + F1–F5). Further domains may extend via string. */
export const AUDIT_ACTIONS = [
  'user.created',
  'user.updated',
  'user.role_changed',
  'user.status_changed',
  'user.deleted',
  'user.scope_changed',
  'user.permission_changed',
  'user.permissions_reset',
  // F1
  'f1.workplan_created',
  'f1.feedback_submitted',
  'f1.serial_created',
  'f1.serial_assigned',
  'f1.moved_to_f2',
  'f1.pre_assigned',
  'f1.document_added',
  'f1.document_removed',
  // F2
  'f2.committed',
  'f2.decommitted',
  'f2.project_updated',
  'f2.project_edited',
  'f2.approval_file_attached',
  'f2.project_deleted',
  'f2.assigned',
  'f2.reassigned',
  // F3
  'f3.mou_created',
  'f3.mou_updated',
  'f3.mou_assigned',
  'f3.mou_reassigned',
  'f3.mou_projects_added',
  'f3.mou_projects_removed',
  'f3.mou_regenerated',
  'f3.signed_mou_uploaded',
  'f3.payment_confirmation_created',
  'f3.payment_confirmation_updated',
  'f3.payment_confirmation_deleted',
  'f3.payment_file_added',
  'f3.payment_file_removed',
  // F4
  'f4.report_created',
  'f4.report_updated',
  'f4.report_deleted',
  'f4.reviewed',
  // F5
  'f5.report_created',
  'f5.report_updated',
  'f5.report_deleted',
  // Project reporting / completion (F4–F5 adjacent)
  'project.reporting_status_changed',
  'project.completed',
  'project.implemented_sector_changed',
] as const

export type AuditAction = (typeof AUDIT_ACTIONS)[number] | (string & {})

export const AUDIT_TARGET_TYPES = [
  'user',
  'role',
  'role_defaults',
  'system',
  'project',
  'project_document',
  'mou',
  'payment_confirmation',
  'payment_file',
  'f4_summary',
  'f5_report',
] as const

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number] | (string & {})

/** Classifies how an event should be interpreted. */
export type AuditEventSource = 'user' | 'system'

export type AuditJson =
  | null
  | boolean
  | number
  | string
  | AuditJson[]
  | { [key: string]: AuditJson }

export type AuditActor = {
  /** public.users.id */
  userId: string
  role: string | null
  /** auth.users.id */
  authUserId: string
  email: string | null
  status: string | null
  displayName: string | null
}

export type AuditRequestMeta = {
  ipAddress: string | null
  userAgent: string | null
}

export type AuditEventInput = {
  action: AuditAction
  /** Explicit portal actor (public.users.id). Preferred when the route already resolved the caller. */
  actorUserId?: string | null
  /**
   * When true and actorUserId is omitted, resolve the actor from the cookie session.
   * Default: true when actorUserId is omitted.
   */
  resolveActor?: boolean
  targetType?: AuditTargetType | null
  targetId?: string | null
  oldValues?: Record<string, unknown> | null
  newValues?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  /** Optional Request / Headers for IP and User-Agent. */
  request?: Request | Headers | null
  /**
   * Event classification. Default 'user'.
   * Use 'system' for internal/ops events — never for silent permission seeding
   * unless you intentionally want a system trail (Phase 2 does not log seeding).
   */
  source?: AuditEventSource
}

export type LogAuditEventResult =
  | { ok: true; id: string }
  | { ok: false; error: string }

// ---------------------------------------------------------------------------
// Sensitive-key sanitization
// ---------------------------------------------------------------------------

const SENSITIVE_KEY_EXACT = new Set(
  [
    'password',
    'temporary_password',
    'temp_password',
    'access_token',
    'refresh_token',
    'token',
    'id_token',
    'secret',
    'private_key',
    'service_role_key',
    'supabase_service_key',
    'supabase_service_role_key',
    'authorization',
    'cookie',
    'cookies',
    'pin',
    'pin_hash',
    'api_key',
    'apikey',
  ].map((k) => k.toLowerCase())
)

const SENSITIVE_KEY_SUBSTRINGS = [
  'password',
  'secret',
  'private_key',
  'service_key',
  'service_role',
  'access_token',
  'refresh_token',
] as const

const REDACTED = '[REDACTED]'

function isSensitiveKey(key: string): boolean {
  const lower = key.toLowerCase()
  if (SENSITIVE_KEY_EXACT.has(lower)) return true
  return SENSITIVE_KEY_SUBSTRINGS.some((part) => lower.includes(part))
}

/**
 * Deep-clone JSON-compatible values and redact sensitive keys.
 * Non-JSON values become string descriptions; circular refs are dropped.
 */
export function sanitizeAuditValue(
  value: unknown,
  seen: WeakSet<object> = new WeakSet()
): AuditJson {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean' || typeof value === 'number') {
    if (typeof value === 'number' && !Number.isFinite(value)) return null
    return value
  }
  if (typeof value === 'string') return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Date) return value.toISOString()

  if (Array.isArray(value)) {
    if (seen.has(value)) return '[Circular]'
    seen.add(value)
    return value.map((item) => sanitizeAuditValue(item, seen))
  }

  if (typeof value === 'object') {
    if (seen.has(value as object)) return '[Circular]'
    seen.add(value as object)
    const out: { [key: string]: AuditJson } = {}
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (isSensitiveKey(key)) {
        out[key] = REDACTED
        continue
      }
      out[key] = sanitizeAuditValue(child, seen)
    }
    return out
  }

  // functions, symbols, etc.
  return String(value)
}

export function sanitizeAuditRecord(
  record: Record<string, unknown> | null | undefined
): Record<string, AuditJson> | null {
  if (record == null) return null
  const sanitized = sanitizeAuditValue(record)
  if (sanitized === null || typeof sanitized !== 'object' || Array.isArray(sanitized)) {
    return null
  }
  return sanitized as Record<string, AuditJson>
}

// ---------------------------------------------------------------------------
// Request metadata
// ---------------------------------------------------------------------------

function headersFromRequest(request?: Request | Headers | null): Headers | null {
  if (!request) return null
  if (request instanceof Headers) return request
  try {
    return request.headers
  } catch {
    return null
  }
}

/**
 * Extract client IP and User-Agent from a Fetch Request or Headers.
 * Prefers x-forwarded-for (first hop), then x-real-ip.
 */
export function extractAuditRequestMeta(
  request?: Request | Headers | null
): AuditRequestMeta {
  const headers = headersFromRequest(request)
  if (!headers) {
    return { ipAddress: null, userAgent: null }
  }

  const forwarded = headers.get('x-forwarded-for')
  let ipAddress: string | null = null
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim()
    ipAddress = first || null
  }
  if (!ipAddress) {
    const realIp = headers.get('x-real-ip')?.trim()
    ipAddress = realIp || null
  }

  const userAgent = headers.get('user-agent')?.trim() || null
  return { ipAddress, userAgent }
}

function normalizeInet(ip: string | null): string | null {
  if (!ip) return null
  // Strip IPv4-mapped IPv6 prefix if present; reject empty / clearly invalid lengths
  const cleaned = ip.replace(/^::ffff:/i, '').trim()
  if (!cleaned || cleaned.length > 64) return null
  return cleaned
}

// ---------------------------------------------------------------------------
// Actor resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the current portal actor from the cookie session.
 * Reuses getSupabaseRouteClient — does not create a parallel auth system.
 * Returns null when unauthenticated or no matching public.users row.
 */
export async function resolveAuditActor(
  supabase?: SupabaseClient
): Promise<AuditActor | null> {
  let client = supabase
  if (!client) {
    const { getSupabaseRouteClient } = await import('@/lib/supabaseRouteClient')
    client = getSupabaseRouteClient()
  }
  const {
    data: { session },
    error: sessionError,
  } = await client.auth.getSession()

  if (sessionError || !session?.user?.id) return null

  const { data: userRow, error: userError } = await client
    .from('users')
    .select('id, role, status, display_name, auth_user_id')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()

  if (userError || !userRow?.id) return null

  return {
    userId: userRow.id as string,
    role: (userRow.role as string | null) ?? null,
    authUserId: session.user.id,
    email: session.user.email ?? null,
    status: (userRow.status as string | null) ?? null,
    displayName: (userRow.display_name as string | null) ?? null,
  }
}

// ---------------------------------------------------------------------------
// logAuditEvent
// ---------------------------------------------------------------------------

function isUuid(value: string | null | undefined): value is string {
  if (!value) return false
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  )
}

/** Validates audit_logs.target_id before insert (null/omit allowed; non-null must be UUID). */
export function validateAuditLogTargetId(
  targetId: string | null | undefined
): { ok: true; normalized: string | null } | { ok: false; error: string } {
  const targetIdRaw =
    typeof targetId === 'string' && targetId.trim() ? targetId.trim() : null
  if (targetIdRaw && !isUuid(targetIdRaw)) {
    return {
      ok: false,
      error: 'logAuditEvent: targetId must be a UUID when provided',
    }
  }
  return { ok: true, normalized: targetIdRaw }
}

/**
 * Append one audit event. Server-side only (service role).
 *
 * Failures are logged with console.error and returned as `{ ok: false }` —
 * they do not throw, so callers' business transactions stay unchanged.
 */
export async function logAuditEvent(
  input: AuditEventInput
): Promise<LogAuditEventResult> {
  try {
    if (!input.action || typeof input.action !== 'string' || !input.action.trim()) {
      const msg = 'logAuditEvent: action is required'
      console.error(msg)
      return { ok: false, error: msg }
    }

    let actorUserId: string | null =
      typeof input.actorUserId === 'string' && input.actorUserId.trim()
        ? input.actorUserId.trim()
        : null

    const shouldResolve =
      input.resolveActor === true ||
      (input.resolveActor !== false && actorUserId == null)

    let actorRole: string | null = null
    if (shouldResolve && actorUserId == null) {
      const actor = await resolveAuditActor()
      if (actor) {
        actorUserId = actor.userId
        actorRole = actor.role
      }
    }

    if (actorUserId && !isUuid(actorUserId)) {
      const msg = 'logAuditEvent: actorUserId must be a UUID'
      console.error(msg, { actorUserId })
      return { ok: false, error: msg }
    }

    const targetCheck = validateAuditLogTargetId(input.targetId)
    if (!targetCheck.ok) {
      console.error(targetCheck.error, { targetId: input.targetId })
      return { ok: false, error: targetCheck.error }
    }
    const targetIdRaw = targetCheck.normalized

    const { ipAddress, userAgent } = extractAuditRequestMeta(input.request ?? null)
    const inet = normalizeInet(ipAddress)

    const source: AuditEventSource = input.source ?? 'user'
    const baseMeta = sanitizeAuditRecord(input.metadata ?? null) ?? {}
    const metadata: Record<string, AuditJson> = {
      ...baseMeta,
      source,
    }
    if (actorRole && metadata.actor_role == null) {
      metadata.actor_role = actorRole
    }

    const row = {
      actor_user_id: actorUserId,
      action: input.action.trim(),
      target_type: input.targetType ?? null,
      target_id: targetIdRaw,
      old_values: sanitizeAuditRecord(input.oldValues ?? null),
      new_values: sanitizeAuditRecord(input.newValues ?? null),
      metadata,
      ip_address: inet,
      user_agent: userAgent ? userAgent.slice(0, 1024) : null,
    }

    let admin: SupabaseClient
    try {
      const { getSupabaseAdmin } = await import('@/lib/supabaseAdmin')
      admin = getSupabaseAdmin()
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : 'logAuditEvent: admin client unavailable'
      console.error('logAuditEvent: failed to create admin client', e)
      return { ok: false, error: msg }
    }

    const { data, error } = await admin
      .from('audit_logs')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      console.error('logAuditEvent: insert failed', {
        message: error.message,
        code: error.code,
        details: error.details,
        action: row.action,
      })
      return { ok: false, error: error.message }
    }

    const id = (data as { id?: string } | null)?.id
    if (!id) {
      const msg = 'logAuditEvent: insert succeeded but no id returned'
      console.error(msg)
      return { ok: false, error: msg }
    }

    return { ok: true, id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'logAuditEvent: unexpected error'
    console.error('logAuditEvent: unexpected error', e)
    return { ok: false, error: msg }
  }
}
