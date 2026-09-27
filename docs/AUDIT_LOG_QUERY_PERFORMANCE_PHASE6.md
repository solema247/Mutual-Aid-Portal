# Phase 6 — Staging Auth/PostgREST Verification (Audit Log Email Performance)

**Scope:** Verification only. No production writes, schema/index changes, B′, or Auth user modifications.

**Measured:** 2026-09-23 (read-only probes).

---

## Environment

| Field | Value |
|--------|--------|
| **Supabase project ref** | `khavbdocjufkyhwpiniw` |
| **Host** | `https://khavbdocjufkyhwpiniw.supabase.co` |
| **Classification** | **production** |
| **Dedicated staging project** | **NOT CONFIGURED** in repo/env |
| **Local Supabase (`supabase start`)** | **NOT AVAILABLE** — no Supabase CLI, no `config.toml` in repo |
| **Production writes** | **None** |

**Gate:** Isolated staging/local was **unavailable**. Work limited to **read-only** probes on the configured hosted project plus static classification checks. Scale (1k/10k Auth users) and **fallback failure injection** were **NOT TESTED** (require local/staging).

---

## Current Phase 5 Path (reference)

```
Search term
  → parseAuditSearchTerm / classifyAuditSearchTerm
  → auditSearchPreQueryPlan
       email kind → users.display_name ILIKE + Auth email path
       general    → display_name + err_projects (no Auth email)
  → findAuthUserIdsByEmailSearch(term, authEmailsFromSearch)
       1) PostgREST: admin.schema('auth').from('users').ilike('email', …)
       2) if querySucceeded → return ids (+ emails in collect map)
       3) else → auth.admin.listUsers pages (bounded scan)
  → users by auth_user_id → searchUserIds
  → buildAuditLogSearchOrParts → audit_logs LIST/COUNT
  → getEmailsByAuthUserIds(auth_user_ids, authEmailsFromSearch seed)
       1) merge seed
       2) PostgREST: auth.users .in('id', …)
       3) missing → auth.admin.getUserById per id (parallel)
  → response actor/target emails
```

---

## PostgREST Test (MEASURED, read-only)

Same client as app: `getSupabaseAdmin()` + `@supabase/supabase-js` `.schema('auth').from('users')`.

| Probe | Latency | Succeeded | Error | Rows |
|--------|---------|-----------|-------|------|
| Email ILIKE `hamza` | **209 ms** | **no** | **PGRST106** | 0 |
| Email ILIKE `test@example.com` | **202 ms** | **no** | **PGRST106** | 0 |
| Batch `.in('id', …)` (10 portal auth_user_ids) | **204 ms** | **no** | **PGRST106** | 0 |

**Interpretation (MEASURED):** PostgREST requests to the **`auth` schema fail** on this hosted project. **PGRST106** indicates the schema is **not exposed** to PostgREST (typical Supabase Cloud default: API serves `public`, not direct `auth.users` REST).

**Application path:** `querySucceeded === false` → **Auth Admin fallback always runs** for email search and enrichment on this environment.

---

## Fallback Test

### Scenario 1 — PostgREST works

**NOT TESTED** in an isolated environment where `auth` schema is exposed. Cannot confirm latency or parity on staging/local.

### Scenario 2 — PostgREST fails (MEASURED on configured host)

| Step | Behavior | Latency (hamza) |
|------|----------|-----------------|
| PostgREST ILIKE | Fails PGRST106 | ~209 ms |
| `findAuthUserIdsByEmailSearch` (full) | Returns **8** auth user ids via fallback | **608 ms** total |
| `getEmailsByAuthUserIds` (10 ids) | **10** emails resolved | **831 ms** (Admin fallback) |
| Seed reuse (all ids pre-seeded) | No Auth/DB work | **0.01 ms** |

**Correctness:** Fallback returns ids/emails; **no N+1 per audit row** (batch parallel `getUserById` for missing ids only).

**Failure injection (simulated outage):** **NOT TESTED** (production only).

---

## Search Parity & Classification (MEASURED, no DB)

| Term | Kind | Auth email prequery? |
|------|------|----------------------|
| `report` | general | **no** |
| `payment` | general | **no** |
| `project` | general | **no** |
| `hamza` | email | yes |
| `a@b.com` | email | yes |

Phase 5 audit row parity for `report` (3 rows) remains valid; Phase 6 did not re-run full pipeline benchmark.

**PostgREST vs Admin id parity for email search:** **NOT MEASURED** (PostgREST returned no ids; Admin parity run skipped to avoid extra production Auth scan load).

---

## Performance

### Phase 5 vs Phase 6 (same production host, MEASURED)

| Scenario | Phase 5 (approx) | Phase 6 probe | Notes |
|----------|------------------|---------------|--------|
| PostgREST email ILIKE | Assumed attempt ~200 ms fail | **209 ms**, **fail PGRST106** | Confirms attempt cost before fallback |
| Auth email search (`hamza`) | ~587 ms scan + prequeries | **608 ms** `findAuthUserIds…` | Fallback still dominates |
| Actor email enrichment | ~600–650 ms | **831 ms** (10 auth ids, all via fallback) | ~83 ms/id Admin path |
| Enrichment with full seed | not isolated | **0.01 ms** | Seed path works |

**Conclusion:** PostgREST does **not** reduce latency on this project today; **~600–830 ms** Admin fallback remains the effective path.

---

## Scale (1k / 10k Auth users)

**NOT TESTED** — no disposable local/staging Auth dataset; no synthetic user creation on production.

---

## Decision

## **NOT SUITABLE** (on current hosted Supabase project)

**Evidence:** Service-role JS client **cannot** query `auth.users` via PostgREST (**PGRST106**). The Phase 5 PostgREST optimization **does not activate**; fallback behavior is **required** for correctness on this environment.

**NOT** “READY FOR IMPLEMENTATION” of PostgREST-only email resolution without a **platform/configuration change** (e.g. exposed schema or different supported API).

---

## Recommended Phase 6B (do not implement yet)

Smallest safe directions **after** product decision (pick one track; verify on **non-production** if schema exposure ever changes):

1. **Accept Admin API** — optimize fallback only: cache emails per `auth_user_id` for request TTL; cap listUsers pages; document that PostgREST auth is unavailable on Supabase Cloud.
2. **Platform** — confirm with Supabase whether `auth.users` REST is supported on your plan; if permanently unavailable, **remove dead PostgREST attempts** (~200 ms wasted per call) and use a single Admin strategy (measure before/after).
3. **Do not** add `email` to `public.users` or change production Auth policies in 6B without explicit approval.

**Do not** remove fallback until PostgREST succeeds in an **isolated** environment with parity tests.

---

## Remaining Bottlenecks (unchanged)

1. Auth Admin `listUsers` / `getUserById` (~600–830 ms measured).
2. Wasted ~200 ms PostgREST attempt that always fails (PGRST106).
3. `audit_logs` LIST/COUNT, project/MOU enrichment, JSONB search (out of Phase 6 scope).

---

## Artifacts

| Item | Path |
|------|------|
| Read-only probe script | `scripts/verify-audit-log-auth-postgrest-phase6.ts` |
| Phase 5 baseline | `docs/AUDIT_LOG_QUERY_PERFORMANCE_PHASE5.md` |

---

## Validation

- `npx tsx scripts/validate-audit-log-foundation.ts` — **PASSED**
- No application code changes in Phase 6 (verification script + report only)

---

## Safety Confirmation

- No production Auth user create/update/delete
- No policy/schema/index/migration changes
- No production audit data changes
- Read-only SELECT/probes and existing Admin read APIs only
