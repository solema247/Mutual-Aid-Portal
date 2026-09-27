# Phase 8B — Staging B′ + End-to-End Audit Log Benchmark

**Scope:** Local/staging only. **Production (`khavbdocjufkyhwpiniw`) not modified** — no schema, indexes, data, deploy, or env changes on production.

**Measured:** 2026-09-24.

---

## Environment

| Item | Status |
|------|--------|
| Dedicated staging Supabase | **NOT CONFIGURED** (`.env.local` → production ref only) |
| Full local Supabase stack | **NOT AVAILABLE** in repo |
| **Isolated Docker Postgres 16** | **YES** — `audit_log_phase7_pg` (port **5436**) |
| **Local PostgREST v12.2.3** | **YES** — `audit_log_phase8b_postgrest` (port **54326**) |
| **Next.js HTTP `GET /api/audit-logs`** | **NOT RUN** — requires local Next + `.env.phase8b` + `AUDIT_LOG_PERF_COOKIE` (no staging admin session) |
| **1M rows** | **NOT TESTED** (100k + 500k completed) |

Safety gate: `scripts/audit-log-query-perf-phase8b.ts` **throws** if `NEXT_PUBLIC_SUPABASE_URL` points at production.

Artifact: `docs/_phase8b_bench.json`

Re-run:

```bash
npx tsx scripts/audit-log-query-perf-phase8b.ts "--sizes=100000,500000"
```

---

## Dataset

Synthetic `audit_logs` only (no PII). Same distribution family as Phase 7, extended action rotation (12 actions including `user.role_changed`, `user.permission_changed`, `project.completed`). Fixed UUID row `00000000-0000-4000-8000-000000000001` for UUID search.

| Size | Rows |
|------|-----:|
| 100k | 100,000 |
| 500k | 500,000 |

---

## B′ Design

From `scripts/audit-log-db-benchmark/phase7-bprime.sql` (unchanged expression):

1. `CREATE EXTENSION pg_trgm` (in phase7-schema)
2. Generated **`grant_search_text`** (metadata + old/new grant fields, newline-separated)
3. GIN trigram indexes: **`action`**, **`metadata->>'endpoint'`**, **`grant_search_text`**
4. Baseline composite **`idx_audit_logs_created_at_id_desc`** present in local schema

**B′ DDL time @ 500k:** ~5.9 s (includes column + 3 indexes).

### Index sizes @ 500k (local)

| Object | Size |
|--------|-----|
| `audit_logs` table | 103 MB |
| `idx_audit_logs_action_trgm` | 13 MB |
| `idx_audit_logs_endpoint_trgm` | 9.3 MB |
| `idx_audit_logs_grant_search_text_trgm` | 3.7 MB |
| `idx_audit_logs_created_at_id_desc` | 19 MB |

---

## Application Changes

**File:** `src/lib/auditLogSearch.ts`

- `auditLogSearchBprimeEnabled()` — `AUDIT_LOG_SEARCH_BPRIME=1` (default **off**).
- When enabled: search uses **`action` + `endpoint` + `grant_search_text`** ILIKE arms instead of six per-field grant JSON ILIKE branches.
- **Unchanged:** UUID branches, numeric/email/general pre-query plan, user/project/role OR branches, **`escapeAuditActionSearchTerm`** for action-like terms (Phase 8A).
- **Route:** no change; uses `buildAuditLogSearchOrParts()` as before.

**Local env template:** `.env.phase8b.example`

**Scripts:**

- `scripts/audit-log-query-perf-phase8b.ts` — parity + SQL timings + PostgREST smoke
- `scripts/audit-log-e2e-phase8b-postgrest.ts` — JWT helper for local PostgREST

---

## Search Parity

**Method:** Application OR parts → SQL (PostgREST segment mirror), full-set **`md5(string_agg(id))`** + count for baseline vs B′.

**Result:** **0 failures** @ 100k and 500k (32 case-instances per size).

| Representative case | 100k count | ID fingerprint match |
|---------------------|----------:|:--------------------:|
| `f4.report_created` | 8,333 | ✓ |
| `f4.report` | 16,667 | ✓ |
| `user.role_changed` | 8,334 | ✓ |
| `f3.payment_confirmation_created` | 8,333 | ✓ |
| `report` | 25,000 | ✓ |
| `LCC` | ~10.8k | ✓ |
| `area=f4` + `f4.report_created` | filtered | ✓ |
| `area=f4` + `user.role_changed` | 0 (invalid) | ✓ |

**Phase 8A gate:** `f4.report_created` exact ID parity under baseline and B′ — **passed**.

---

## COUNT Parity

Every search case: **baseline total = B′ total** (see `count_match` in artifact).

---

## LIST / Cursor Parity

- Default page 1 (25 rows): **match**
- Keyset page 2 predicate: **match**
- `report` search page 1 IDs: **match**

Ordering: `created_at DESC, id DESC` (unchanged).

---

## HTTP Benchmark

| Status | Detail |
|--------|--------|
| **NOT RUN** | No authenticated local Next session (`AUDIT_LOG_PERF_COOKIE` unset). PostgREST smoke against Docker: **OK**. |

**Implication:** End-to-end latency (auth ~2 calls, enrichment/Auth email ~480–530 ms from Phase 6B on production-shaped paths) **not measured** in this phase. SQL/script timings **include Docker `psql` round-trip**, not PostgREST/Next.js.

To complete HTTP leg (operator):

1. Apply B′ DDL on **non-prod** DB only.
2. Run Next with `.env.phase8b.example` values + `AUDIT_LOG_SEARCH_BPRIME=0|1`.
3. `npx tsx scripts/audit-log-query-perf-phase8b.ts --http http://127.0.0.1:3000` with `AUDIT_LOG_PERF_COOKIE`.

---

## Baseline vs B′ (SQL path @ 500k, median ms, 5 reps after warmup)

Script = filtered LIST/COUNT via `psql` mirroring application OR filters.

### COUNT (selected)

| Case | Baseline median | B′ median | Δ |
|------|----------------:|----------:|---|
| `report` | 387.9 | 233.7 | **~40% faster** |
| `LCC` | 412.4 | 249.0 | **~40% faster** |
| `payment` | (see JSON) | improved | grant/token-style |
| `f4.report_created` | 383.3 | 455.3 | **~19% slower** |
| `default_page` (all rows) | 211.0 | 177.6 | ~16% faster |

### LIST (selected)

| Case | Baseline median | B′ median | Δ |
|------|----------------:|----------:|---|
| `report` | 255.3 | 153.7 | **~40% faster** |
| `default_page` | 183.2 | 150.8 | ~18% faster |
| `f4.report_created` | 200.0 | 176.8 | ~12% faster (LIST) |

Mixed results: **grant/general token COUNT** improves materially; **some action-heavy COUNT** plans regress at 500k (planner/index choice — needs `EXPLAIN` on staging PostgREST, not only Docker psql).

---

## Database-Level Improvement

**Yes, for several high-volume search patterns** (`report`, `LCC`, `payment`, `project`) at 500k — often **~30–40%** lower median COUNT time in this bench.

**Not uniform:** `f4.report_created` COUNT median **worse** under B′ @ 500k despite identical results.

---

## End-to-End Improvement

**Unknown / not proven** — HTTP not executed. Expect Auth + enrichment to dominate typical production page loads (Phase 4–6B), so SQL gains may translate to **modest** user-visible improvement unless search/COUNT is the bottleneck on the request.

Example framing (illustrative, not measured here):

| Layer | Hypothesis |
|-------|------------|
| SQL COUNT | 390 ms → 234 ms |
| Full HTTP | 1500 ms → 1420 ms if enrichment ~800 ms fixed |

---

## Auth / Enrichment Impact

Not re-measured. Phase 6B: Auth enrichment **~480–530 ms** on production-shaped reads. B′ does **not** reduce enrichment cost.

---

## Correctness Findings

- `npx tsx scripts/validate-audit-log-foundation.ts` — **PASSED** (includes §5e3 B′ OR shape + Phase 8A actions).
- Area mapping (User Management, Permissions, F1–F5, All Activity) — **unchanged**; invalid area/search combos stay empty.
- **No production changes.**

---

## Decision

### **PARTIALLY JUSTIFIED**

**For:**

- Exact **search/COUNT/LIST parity** baseline vs B′ @ 100k/500k with Phase 8A action fix.
- **Material SQL COUNT gains** on general/grant-style searches at 500k.
- Acceptable **local index footprint** (~26 MB trigram + generated column @ 500k in this bench).

**Against full production rollout now:**

- **No staging Supabase HTTP/PostgREST proof** — real filter plans and latency differ from Docker `psql`.
- **Mixed COUNT performance** (e.g. `f4.report_created` slower @ 500k).
- **End-to-end user latency not validated**; enrichment/Auth likely still dominates.
- Requires **production migration** (generated column + indexes) — explicitly out of scope for this phase.

**Production deployment justified?** **No** — not without staging migration + HTTP benchmarks + ops sign-off.

---

## Recommended next steps (before production B′)

1. **Provision non-prod Supabase** with B′ DDL migration script (from `phase7-bprime.sql` + review).
2. **HTTP benchmark** — Phase 4-style `--http` with `AUDIT_LOG_ROUTE_PERF=1`, baseline vs `AUDIT_LOG_SEARCH_BPRIME=1`, 5+ reps, report median/p95 and perf snapshot breakdown (auth, prequery, list, count, enrichment).
3. **`EXPLAIN (ANALYZE)`** on staging PostgREST for regressions (`f4.report_created` COUNT).
4. **Confirm** composite `(created_at DESC, id DESC)` on production `audit_logs` (read-only check only).
5. **Feature flag rollout:** default off → staging on → production review gate (parity tests in CI + `validate-audit-log-foundation.ts`).

**Do not deploy B′ to production without explicit approval and a migration window.**
