/**
 * Phase 6 — read-only verification of PostgREST auth.users vs Auth Admin fallback.
 * No writes, no Auth user creation, no schema/policy changes.
 *
 * Usage: npx tsx scripts/verify-audit-log-auth-postgrest-phase6.ts
 */

import dotenv from 'dotenv'
import path from 'path'
import { performance } from 'node:perf_hooks'
import { getSupabaseAdmin } from '../src/lib/supabaseAdmin'
import {
  auditSearchPreQueryPlan,
  classifyAuditSearchTerm,
  escapeAuditSearchTerm,
  parseAuditSearchTerm,
} from '../src/lib/auditLogSearch'
import {
  findAuthUserIdsByEmailSearch,
  getEmailsByAuthUserIds,
} from '../src/app/api/users/utils/authEmails'

dotenv.config({ path: path.join(process.cwd(), '.env.local') })

const PRODUCTION_REF = 'khavbdocjufkyhwpiniw'

function projectRef(): { ref: string | null; host: string | null; classification: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const m = url.match(/^https:\/\/([^.]+)\.supabase\.co/)
  return {
    ref: m?.[1] ?? null,
    host: m ? `https://${m[1]}.supabase.co` : null,
    classification:
      m?.[1] === PRODUCTION_REF
        ? 'production'
        : m?.[1]
          ? 'non-production'
          : 'unknown',
  }
}

function ilikePatternContains(term: string): string {
  const escaped = term.replace(/\\/g, '\\\\').replace(/%/g, '\\%').replace(/_/g, '\\_')
  return `%${escaped}%`
}

async function probePostgrestEmailIlike(term: string) {
  const admin = getSupabaseAdmin()
  const t0 = performance.now()
  const { data, error } = await admin
    .schema('auth')
    .from('users')
    .select('id, email')
    .ilike('email', ilikePatternContains(term.toLowerCase()))
    .limit(200)
  const ms = Math.round((performance.now() - t0) * 100) / 100
  return {
    ms,
    ok: !error && Array.isArray(data),
    errorCode: error?.code ?? error?.message?.slice(0, 80) ?? null,
    rowCount: Array.isArray(data) ? data.length : 0,
    ids: Array.isArray(data) ? (data as { id: string }[]).map((r) => r.id) : [],
  }
}

async function probePostgrestBatchById(authIds: string[]) {
  const admin = getSupabaseAdmin()
  const t0 = performance.now()
  const { data, error } = await admin
    .schema('auth')
    .from('users')
    .select('id, email')
    .in('id', authIds)
  const ms = Math.round((performance.now() - t0) * 100) / 100
  const rows = Array.isArray(data) ? (data as { id: string; email: string | null }[]) : []
  return {
    ms,
    ok: !error && Array.isArray(data),
    errorCode: error?.code ?? error?.message?.slice(0, 80) ?? null,
    rowCount: rows.length,
    emailsResolved: rows.filter((r) => r.email).length,
  }
}

async function probeAdminListUsersScan(term: string) {
  const admin = getSupabaseAdmin()
  const ids = new Set<string>()
  const t0 = performance.now()
  let pages = 0
  try {
    for (let page = 1; page <= 5; page += 1) {
      pages += 1
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) break
      const users = data?.users ?? []
      for (const u of users) {
        const email = u.email?.toLowerCase()
        if (!email) continue
        if (email === term || email.includes(term)) ids.add(u.id)
      }
      if (users.length < 200) break
    }
  } catch {
    /* read-only probe */
  }
  return {
    ms: Math.round((performance.now() - t0) * 100) / 100,
    pages,
    idCount: ids.size,
    ids: [...ids],
  }
}

function setsEqual(a: string[], b: string[]): boolean {
  const sa = new Set(a)
  const sb = new Set(b)
  if (sa.size !== sb.size) return false
  for (const x of sa) if (!sb.has(x)) return false
  return true
}

async function main() {
  const env = projectRef()
  console.log(JSON.stringify({ phase: 6, environment: env }, null, 2))

  if (env.classification === 'production') {
    console.log(
      'NOTE: Production — read-only probes only. No scale test, no Auth user creation, no failure injection.'
    )
  }

  const admin = getSupabaseAdmin()

  const { data: portalUsers } = await admin
    .from('users')
    .select('auth_user_id')
    .not('auth_user_id', 'is', null)
    .limit(25)

  const authIdsSample = [
    ...new Set(
      (portalUsers ?? [])
        .map((r) => r.auth_user_id as string)
        .filter((id) => typeof id === 'string' && id.length > 0)
    ),
  ].slice(0, 10)

  const classificationChecks = ['report', 'payment', 'project', 'hamza', 'a@b.com'].map(
    (term) => {
      const parsed = parseAuditSearchTerm(term)
      const plan = auditSearchPreQueryPlan(parsed.kind, parsed.escaped)
      return {
        term,
        kind: parsed.kind,
        authEmailPrequery: plan.authEmail,
      }
    }
  )

  const emailTerms = [
    { label: 'local-part', term: 'hamza' },
    { label: 'full-email-placeholder', term: 'test@example.com' },
  ]

  const emailProbes = []
  for (const { label, term } of emailTerms) {
    const postgrest = await probePostgrestEmailIlike(term)
    const tFind0 = performance.now()
    const collect = new Map<string, string>()
    const viaApp = await findAuthUserIdsByEmailSearch(term, collect)
    const findMs = Math.round((performance.now() - tFind0) * 100) / 100

    let adminScan: Awaited<ReturnType<typeof probeAdminListUsersScan>> | null = null
    let parityMatch: boolean | null = null
    if (postgrest.ok && env.classification === 'production') {
      adminScan = await probeAdminListUsersScan(term.toLowerCase())
      parityMatch = setsEqual(postgrest.ids.sort(), adminScan.ids.sort())
    }

    emailProbes.push({
      label,
      term,
      postgrest,
      findAuthUserIdsByEmailSearch_ms: findMs,
      findAuthUserIds_count: viaApp.length,
      collectMapSize: collect.size,
      fallbackLikely: !postgrest.ok,
      adminScanParity: parityMatch,
      adminScan_ms: adminScan?.ms ?? null,
    })
  }

  const batchProbe = await probePostgrestBatchById(
    authIdsSample.length > 0 ? authIdsSample : ['00000000-0000-4000-8000-000000000000']
  )

  const tEnrich0 = performance.now()
  const enrichMap = await getEmailsByAuthUserIds(authIdsSample)
  const enrichMs = Math.round((performance.now() - tEnrich0) * 100) / 100

  const tEnrichSeed0 = performance.now()
  const seed = new Map(enrichMap)
  const enrichWithSeed = await getEmailsByAuthUserIds(authIdsSample, seed)
  const enrichSeedMs = Math.round((performance.now() - tEnrichSeed0) * 100) / 100

  const report = {
    measured_at: new Date().toISOString(),
    environment: env,
    scale_test_1k_10k: 'NOT TESTED — no isolated staging/local Supabase',
    local_supabase: 'NOT AVAILABLE — no supabase CLI/config in repo',
    fallback_failure_injection: 'NOT TESTED — requires local/staging only',
    classification_checks: classificationChecks,
    email_probes: emailProbes,
    enrichment: {
      auth_ids_sample_size: authIdsSample.length,
      postgrest_batch: batchProbe,
      getEmailsByAuthUserIds_ms: enrichMs,
      map_size: enrichMap.size,
      getEmailsByAuthUserIds_with_full_seed_ms: enrichSeedMs,
      seed_skips_work: enrichWithSeed.size === enrichMap.size && enrichSeedMs < enrichMs / 2,
    },
  }

  const outPath = path.join(process.cwd(), 'docs', '_phase6_probe_results.json')
  await import('fs').then((fs) => fs.writeFileSync(outPath, JSON.stringify(report, null, 2)))
  console.log(JSON.stringify(report, null, 2))
  console.log(`\nWrote ${outPath}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
