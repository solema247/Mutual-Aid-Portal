# Phase 4 — Audit Log Query Performance Audit

**Scope:** Read-only measurement and static analysis. No schema, index, migration, query, or UI behavior changes (except dev-only timing behind `AUDIT_LOG_ROUTE_PERF=1`).

**Measured:** 2026-09-23 (single pass per case, 300 ms pause between cases on production).

---

## Executive Summary

On the configured **production** Supabase project (`khavbdocjufkyhwpiniw`, **59** `audit_logs` rows), end-to-end **service-role pipeline time** (mirrors `GET /api/audit-logs` DB work; **excludes** cookie auth and JSON mapping) is dominated by:

1. **Enrichment (~60–85% of pipeline time on typical full pages)** — especially `getEmailsByAuthUserIds` (**~600–670 ms** per request when actors need email) and batched project/MOU/payment lookups (**~200–790 ms** depending on page size).
2. **Search prequeries for email-classified terms (~800 ms)** — `findAuthUserIdsByEmailSearch` Auth Admin scan (**~390 ms**) plus users display-name ILIKE (**~205 ms**) plus users-by-auth-id (**~205 ms**).
3. **`audit_logs` LIST and COUNT** — each **~205–295 ms** over the network (similar magnitude at this row count); COUNT runs only when Phase 2A requires it (full page of results).

**LIST/search ILIKE on JSONB is not the top bottleneck at 59 rows**; latency is mostly **round-trip count × (PostgREST + Auth Admin API)** and **enrichment**, not local CPU.

**Not measured:** HTTP auth (`requireAuditLogViewer`: session + `users` lookup), `EXPLAIN` plans (no direct Postgres URL), load/stress testing.

---

## Request Pipeline

```
HTTP GET /api/audit-logs
  → requireAuditLogViewer()          [auth: getSession + users.single — NOT in benchmark script]
  → parseAuditSearchTerm + preQuery plan
  → optional prequeries:
       users.display_name ILIKE
       Auth admin listUsers (email search)
       users by auth_user_id
       err_projects grant_id / grant_serial_id ILIKE (general search only)
  → buildAuditLogSearchOrParts → applyAuditLogListFilters on audit_logs
  → optional keyset cursor OR filter
  → audit_logs LIST (order created_at DESC, id DESC; limit/range)
  → resolveAuditLogListTotalNeed → optional exact COUNT (same filters)
  → enrichment (batched, not per-row audit query):
       users IN (actor + user targets)
       getEmailsByAuthUserIds (auth schema query or N× getUserById fallback)
       optional partners / emergency_rooms / states IN
       fetchEnrichmentLookups: err_projects, mous, mou_payment_confirmations IN
  → map rows + sanitize → JSON response
```

**Dev-only timing:** set `AUDIT_LOG_ROUTE_PERF=1` on the Next.js server; route logs sanitized JSON (`tag: audit_log_route_perf`) with stage ms, DB op names, row counts, count mode — no search terms or PII.

**Repeatable benchmark (DB path only):** `npx tsx scripts/audit-log-query-perf-phase4.ts`

Optional full HTTP: `--http=http://localhost:3001` with `AUDIT_LOG_PERF_COOKIE` (not run in this phase).

---

## Benchmark Table

**Label:** **MEASURED** — service-role pipeline mirror; **not** including auth or response serialization.

| Case | Description | Total (ms) | Prequeries (ms) | LIST (ms) | COUNT (ms) | Enrichment (ms) | DB Calls |
|------|-------------|------------|-----------------|-----------|------------|-----------------|----------|
| A | Default page 1 | 1804 | 0 | 295 | 212 | 1295 | 5 |
| B | `area=user_management` | 1026 | 0 | 207 | 0 | 818 | 4 |
| C | `area=permissions` | 1035 | 0 | 210 | 0 | 825 | 4 |
| D | `actions=user.created` | 1032 | 0 | 203 | 0 | 828 | 4 |
| E | `search=report` | 2043 | 804 | 209 | 0 | 1029 | 7 |
| F | email-like local-part | 2532 | 810 | 214 | 210 | 1297 | 8 |
| G | audit UUID search | 213 | 0 | 213 | 0 | 0 | 2 |
| H | 30-day date range | 1686 | 0 | 210 | 207 | 1269 | 5 |
| I | `area=user_management` + search | 806 | 596 | 209 | 0 | 0 | 4 |
| J | cursor page 2 | 1913 | 0 | 208 | 205 | 1499 | 5 |
| K | `pageSize=100` (max) | 1823 | 0 | 214 | 0 | 1609 | 4 |

**Environment:** production ref `khavbdocjufkyhwpiniw`, **59** audit rows. Timings include client→Supabase network latency from the measurement machine.

---

## Search Breakdown

| Pattern | Prequeries | LIST | COUNT | Notes |
|---------|------------|------|-------|-------|
| No search (A) | none | ~295 ms | ~212 ms when full page | Broad OR absent |
| Area only (B,C) | none | ~207–210 ms | skipped (partial/empty page) | `action IN (...)` from area |
| Action filter (D) | none | ~203 ms | skipped (1 row) | Index-friendly `action` eq set |
| General term `report` (E) | **~804 ms** | ~209 ms | skipped (3 rows) | Term classified **email**, not general — runs Auth scan + display name (no grant prequery) |
| Email-like (F) | **~810 ms** | ~214 ms | ~210 ms (full page) | Auth scan ~390 ms dominates prequery |
| UUID (G) | none | ~213 ms | skipped (0 rows) | Equality branches only; minimal enrichment |
| Area + search (I) | **~596 ms** | ~209 ms | skipped (0 rows) | Auth scan runs even when 0 auth matches |

**MEASURED:** Search adds **0–3 extra DB/Auth round trips** before the main query. Email-like and misclassified short tokens trigger the expensive Auth Admin user list scan (up to **5×200** users paginated in code).

**NOT MEASURED:** ILIKE selectivity and seq scan vs index at large row counts (needs staging + `EXPLAIN`).

---

## Pagination Breakdown

| Scenario | LIST (ms) | COUNT | Notes |
|----------|-----------|-------|-------|
| Page 1 default (A) | ~295 | yes | Full 25/59 → needs DB count |
| Page 1 area partial (B) | ~207 | no | 9 rows &lt; pageSize → derived total |
| Cursor page 2 (J) | ~208 | yes | Keyset OR + limit; COUNT still ~205 ms |
| Max page (K) | ~214 | no | 59 rows &lt; 100 → derived total |

**MEASURED:** Cursor does **not** reduce LIST time versus page 1 at this scale (~208 vs ~295 ms — within noise). COUNT policy unchanged: full pages still hit `COUNT(*)`.

**NOT MEASURED:** OFFSET legacy path (`page>1` without cursor) — not exercised in this run.

---

## Enrichment Analysis

**N+1 on `audit_logs`:** **No** — one LIST query per request.

**Batched enrichment (MEASURED):**

| Step | Typical ms (25-row page) | Calls |
|------|--------------------------|-------|
| `users` IN | ~205–250 | 0–1 |
| `getEmailsByAuthUserIds` | **~620–670** | 1 Auth path (+ up to N `getUserById` if auth schema query fails) |
| `partners` / `rooms` / `states` | 0 if no IDs on page | 0–3 |
| `fetchEnrichmentLookups` | ~420 (3 sequential IN queries) | 1–3 tables |

**MEASURED:** Enrichment scales with **page size** (K: **~788 ms** project/MOU/payment batch for 59 rows / 33 lookup keys) but **not** one query per audit row.

**Potential N+1:** **Auth fallback** — `getEmailsByAuthUserIds` may call `auth.admin.getUserById` per missing ID (parallel, not audit-row-driven). At 1 actor, still **~620 ms** → likely Auth API latency, not row count.

---

## COUNT Findings

**Logic (code):** `resolveAuditLogListTotalNeed` — derived total when page 1 empty, page &gt; 1 empty, or `rowCount < pageSize`; else exact COUNT.

**MEASURED on this dataset:**

| Case | COUNT ran? | ms | Reason |
|------|------------|-----|--------|
| A, F, H, J | yes | ~205–212 | Full page returned |
| B, C, D, E, G, I, K | no | 0 | Partial or empty page |

**MEASURED:** COUNT uses the **same** `applyAuditLogListFilters` as LIST (including search OR and area action IN).

**NOT MEASURED:** COUNT cost vs row count at 100k+ (Phase 3E/3F SQL-only pilots suggested COUNT dominates with search; not re-run on production).

---

## Index Alignment

**From repo DDL** (`sql/create_audit_logs.sql`) — **PROJECTED** alignment unless live DB differs:

| Index | Predicate / sort | Alignment |
|-------|------------------|-----------|
| `(created_at DESC)` | `ORDER BY created_at DESC, id DESC` | Partial — sort needs **id** tie-breaker |
| `(action)` | area/action `IN` | Good for area tabs |
| `(actor_user_id)` | actor filter | Good |
| `(target_type, target_id)` | target type filter; UUID equality in search | Good for eq paths |
| — | `metadata->>…` / `old_values->>…` ILIKE OR | **No** dedicated index — likely heap/seq filter |
| — | Keyset `(created_at, id) < cursor` OR | Composite **(created_at DESC, id DESC)** helps if present on live DB |

**NOT MEASURED:** Live index list (no read-only SQL catalog query run). **EXPLAIN (ANALYZE, BUFFERS)** not performed — no `DATABASE_URL` / SQL editor access in this run.

**Note:** Conversation history referenced a live composite `(created_at DESC, id DESC)` index; it is **not** in the public repo migration file — treat as **environment-specific**.

---

## Bottlenecks (evidence-ranked)

1. **Enrichment — Auth email resolution** — **MEASURED ~620–670 ms** on most pages with a user actor (`enrichment.auth_emails`).
2. **Enrichment — project/MOU/payment batch** — **MEASURED ~420 ms** (25 rows) up to **~788 ms** (59 rows / K).
3. **Search — Auth email prequery** — **MEASURED ~390 ms** when term is email-classified (F, E, I).
4. **Search — users display_name prequery** — **MEASURED ~205 ms** when enabled.
5. **audit_logs COUNT** — **MEASURED ~205–212 ms** when Phase 2A requires it (similar to LIST).
6. **audit_logs LIST** — **MEASURED ~203–295 ms** at 59 rows.
7. **HTTP auth** — **NOT MEASURED** in script (expect 2+ Supabase calls via route client).

---

## Recommendations (do not implement in Phase 4)

### P0 — measured on current path

- **Reduce or replace Auth Admin email scan** for search (`findAuthUserIdsByEmailSearch`) — largest search prequery cost; consider portal-side email index or restrict email search to full addresses.
- **Optimize actor email enrichment** (`getEmailsByAuthUserIds`) — confirm auth-schema batch query works in production; avoid per-id `getUserById` fallback.
- **Revisit email classification** for short tokens like `report` (MEASURED: triggers email prequeries) — product/search correctness interacts with perf.

### P1 — verify on staging at scale

- **B′ trigram / consolidated grant search** (Phases 3E–3F) for COUNT/LIST with general search and grant tokens.
- **Composite index `(created_at DESC, id DESC)`** if not already on live DB — keyset + default sort.
- **COUNT vs search** — exact count with wide OR may dominate at 100k+ (prior SQL pilots; needs staging HTTP).

### P2 — future

- Optional **defer enrichment** (emails, project labels) to client or secondary request.
- **Cache** filter-options and stable lookup maps for admin UI sessions.

---

## Production Readiness Checklist (performance)

| Item | Status |
|------|--------|
| Staging HTTP benchmark | NOT TESTED |
| EXPLAIN at scale | NOT TESTED |
| Auth stage measured | NOT TESTED |
| Read-only production sample | MEASURED (11 cases, 59 rows) |

---

## Files Touched in Phase 4

| File | Purpose |
|------|---------|
| `src/lib/auditLogRoutePerf.ts` | Dev-only perf collector |
| `src/app/api/audit-logs/route.ts` | Instrumentation when `AUDIT_LOG_ROUTE_PERF=1` |
| `scripts/audit-log-query-perf-phase4.ts` | Read-only benchmark script |
| `docs/AUDIT_LOG_QUERY_PERFORMANCE_PHASE4.md` | This report |

---

## Validation

- `npx tsx scripts/validate-audit-log-foundation.ts` — **PASSED**
- TypeScript: **no errors** in `auditLogRoutePerf.ts` / `audit-logs/route.ts` (project has pre-existing errors elsewhere)

---

## Safety Confirmation

- No production writes, schema changes, indexes, or migrations.
- No load testing; single-sample cases with short pauses.
- Benchmark uses read-only SELECT/COUNT and existing Auth list APIs used by the route.
- Synthetic load / 100k rows **not** inserted.

---

## Recommended Next Phase

**Phase 5 (optimization)** — pick one P0 item (Auth email search + enrichment batching proof) and re-measure on **isolated staging** with HTTP + optional `EXPLAIN`, then evaluate B′ for search/COUNT at ≥100k rows. Do not optimize LIST alone until enrichment and search prequeries are addressed or parallelized.
