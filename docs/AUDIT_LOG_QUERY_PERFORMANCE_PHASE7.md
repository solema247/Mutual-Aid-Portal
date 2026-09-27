# Phase 7 — Audit Log DB Query Performance & B′ Decision Gate

**Scope:** Isolated Docker PostgreSQL only. **Production not modified** (no schema, indexes, data, or deploy).

**Measured:** 2026-09-24.

---

## Environment

| Item | Value |
|------|--------|
| **Type** | Isolated **Docker** Postgres 16 (`audit_log_phase7_pg`, port **5436**) |
| **Production** | **Not used** for synthetic data or load |
| **Staging Supabase / local Supabase stack** | **Not available** |
| **HTTP `GET /api/audit-logs`** | **NOT TESTED** (no non-prod PostgREST app env) |
| **1M rows** | **NOT TESTED** (10k / 100k / 500k completed) |

Artifact: `docs/_phase7_bench.json` (full timings). Re-run:  
`npx tsx scripts/audit-log-query-perf-phase7.ts "--sizes=10000,100000,500000"`

---

## Current Query Architecture (application)

### LIST (`route.ts`)

- Filters: area → effective `action IN (…)`, optional `actor_user_id IN`, `target_type IN`, date `created_at` range, search → PostgREST `.or(...)` (see `auditLogSearch.ts`).
- Order: `created_at DESC`, `id DESC`.
- Page 1 / keyset: `LIMIT pageSize`.
- Legacy: `OFFSET (page-1)*pageSize` when `page>1` without cursor.
- Keyset: `(created_at < t) OR (created_at = t AND id < i)` (`auditLogCursor.ts`).

### COUNT

- Same filter stack via `applyAuditLogListFilters` + `count: exact, head: true` (Phase 2A may skip when derived).

### SEARCH (SQL shape mirrored in benchmark)

- **action / endpoint:** `ILIKE '%term%'` on `action`, `metadata->>'endpoint'`.
- **Grant (baseline):** six JSONB `ILIKE` arms (`pushGrantIdentifierSearchBranches`).
- **B′ (experiment):** `grant_search_text` generated column + single `ILIKE`; trigram GIN on `action`, `endpoint`, `grant_search_text`.
- **UUID / numeric / email / general** branches per `buildAuditLogSearchOrParts`.

### Existing indexes (repo + benchmark)

From `sql/create_audit_logs.sql` + benchmark composite:

- PK `id`
- `idx_audit_logs_created_at (created_at DESC)`
- `idx_audit_logs_created_at_id_desc (created_at DESC, id DESC)`
- `idx_audit_logs_action`, `idx_audit_logs_actor_user_id`, `idx_audit_logs_target (target_type, target_id)`

---

## Dataset

Synthetic `audit_logs` only (no PII): mixed actions (F1–F5, user, MOU, payment, project), metadata endpoints, grant serial/id in metadata and old/new JSONB (~deterministic modulo patterns).

| Size | Rows inserted |
|------|----------------|
| 10k | 10,000 |
| 100k | 100,000 |
| 500k | 500,000 |

---

## Baseline LIST Results

**Label:** Script timings include **Docker `psql` round-trip** (~110–190 ms for simple LIST); **Postgres execution** from EXPLAIN is much lower (see below).

| Dataset | Page 1 LIST | Keyset LIST | OFFSET page 10 | Area F4 LIST |
|--------:|------------:|------------:|---------------:|-------------:|
| 10k | 110 ms | 118 ms | 127 ms | 123 ms |
| 100k | 113 ms | 134 ms | 163 ms | — |
| 500k | 129 ms | 188 ms | 119 ms | — |

**EXPLAIN @ 100k (page 1):** **Index Only Scan** on `idx_audit_logs_created_at_id_desc`, **Execution Time ~0.06 ms** (local PG).

**Keyset vs OFFSET @ 100k:** Keyset 134 ms vs OFFSET p10 163 ms (script latency; PG plan still index-friendly for keyset predicate).

---

## Baseline COUNT Results

| Dataset | COUNT all | COUNT area F4 |
|--------:|----------:|--------------:|
| 10k | 117 ms (10k) | 108 ms |
| 100k | 160 ms | — |
| 500k | 159 ms | — |

COUNT scales with **filter selectivity**, not full table size, for unfiltered count on analyzed data (~160 ms script time at 100k–500k).

---

## Baseline Search Results (COUNT ms, script)

| Search | 10k | 100k | 500k |
|--------|----:|-----:|-----:|
| `report` (general) | 124 | 164 | 265 |
| `LCC` (grant) | 114 | 160 | **283** |
| `/api/f4` via term `f4` (endpoint/action) | 137 | — | — |
| `f4.report_created` (action_like) | 133 | — | — |

**EXPLAIN @ 100k — baseline COUNT `LCC`:** parallel **seq aggregate** over filtered rows, **Execution Time ~62 ms** (JSONB ILIKE OR, no trigram).

---

## Keyset vs OFFSET

| Dataset | Keyset p2 equiv | OFFSET p10 |
|--------:|----------------:|-----------:|
| 100k | 134 ms | 163 ms |
| 500k | 188 ms | 119 ms |

**Conclusion:** At scale, prefer **keyset** for deep pages (app already uses keyset when cursor sent). OFFSET cost is variable under Docker timing noise.

---

## B′ Experiment

**Isolated DDL:** `scripts/audit-log-db-benchmark/phase7-bprime.sql` (pg_trgm, `grant_search_text`, 3 GIN indexes).

**Index sizes @ 100k (B′ applied):**

| Index | Size |
|-------|------|
| `idx_audit_logs_action_trgm` | ~3296 kB |
| `idx_audit_logs_endpoint_trgm` | ~2256 kB |
| `idx_audit_logs_grant_search_text_trgm` | ~976 kB |
| `idx_audit_logs_created_at_id_desc` | ~3976 kB |

---

## B′ Result Parity

| Search term | 10k | 100k | 500k |
|-------------|:---:|:----:|:----:|
| `report` | ✓ | ✓ | ✓ |
| `f4` (endpoint) | ✓ | ✓ | ✓ |
| `LCC` | ✓ | ✓ | ✓ |
| grant serial | ✓ | ✓ | ✓ |
| `f4.report_created` | ✓* | ✓* | ✓* |
| UUID (non-matching) | ✓ | ✓ | ✓ |

\* **Vacuous parity:** both baseline and B′ return **0 rows** for action search due to underscore bug (see below).

---

## B′ Performance (COUNT ms, same queries)

| Search | 10k base → B′ | 100k base → B′ | 500k base → B′ |
|--------|-------------:|---------------:|---------------:|
| **LCC grant** | 114 → **103** | 160 → **196**† | **283 → 195** |
| **report** | 124 → 151 | 164 → 193 | 265 → **184** |

†Run variance; **500k grant COUNT** shows clearest win (**~31%** script time reduction).

LIST search rows: similar or mixed; **COUNT + grant/token search** is the primary B′ benefit in this experiment.

---

## Correctness Issues

### SEARCH CORRECTNESS BUG — underscore (still present)

| Dataset | Rows with `action = 'f4.report_created'` | Rows matching baseline search SQL for `f4.report_created` |
|--------:|----------------------------------------:|----------------------------------------------------------:|
| 10k | **1,111** | **0** |
| 100k | **11,111** | **0** |
| 500k | **55,555** | **0** |

`escapeAuditSearchTerm('f4.report_created')` → **`f4.reportcreated`** (underscore stripped). **Do not deploy B′ without addressing this** for action-like searches.

---

## Decision Gate

## **B. B′ PARTIALLY JUSTIFIED**

**Evidence FOR (future controlled implementation on staging/production):**

- Exact **ID parity** for grant/general searches tested (10k–500k).
- **Grant/token COUNT** improves at **500k** with trigram + `grant_search_text`.
- LIST page 1 already uses **`idx_audit_logs_created_at_id_desc`** efficiently.

**Evidence AGAINST full rollout now:**

- **Underscore action search** is broken (0 hits); B′ does not fix it.
- Some searches (**report** @ 10k) **not faster** with B′; mixed LIST results.
- **Index storage** ~6.5 MB trigram + generated column at 100k (scale linearly).
- Production **HTTP/PostgREST** path **not re-tested** in Phase 7.
- Script timings include Docker overhead; use EXPLAIN for PG-native comparison.

**Do not deploy B′ to production in this phase.**

---

## Recommended Phase 8

1. **Fix underscore / action_like search** (correctness) — separate small change + parity tests.
2. **Staging migration:** B′ DDL + app search reshape (three ILIKE arms) behind feature flag; HTTP benchmark (Phase 3G-style).
3. **Keep** composite `(created_at DESC, id DESC)` on production if missing.
4. **Defer** COUNT/LIST micro-optimizations unrelated to search until staging proves B′ on real PostgREST filters.

---

## Validation

- `npx tsx scripts/validate-audit-log-foundation.ts` — **PASSED**
- Application code **unchanged** (benchmark scripts + SQL only)
- Phase 4/6B HTTP benchmarks — **not re-run** (out of scope)

---

## Safety

- No production database, schema, index, or Auth changes.
- Container `audit_log_phase7_pg` is local-only; remove with `docker rm -f audit_log_phase7_pg` when done.
