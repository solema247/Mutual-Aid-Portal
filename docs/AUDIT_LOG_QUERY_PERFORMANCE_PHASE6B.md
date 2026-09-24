# Phase 6B — Audit Log Auth Admin Fallback Optimization

**Scope:** Application-only Auth path for Audit Log email search/enrichment. No schema/index/migration changes.

**Measured:** 2026-09-23, production ref `khavbdocjufkyhwpiniw`, read-only pipeline script (59 audit rows).

---

## Objective

Remove the dead PostgREST `auth.users` attempt (~200 ms, PGRST106) and optimize Supabase Auth Admin usage (`listUsers` / `getUserById`) while preserving Phase 5 search classification and response shape.

---

## Phase 5 Baseline (reference)

| Metric | Typical |
|--------|---------|
| Failed PostgREST attempt before fallback | ~200 ms |
| `enrichment.auth_emails` | ~620–670 ms |
| Email search Auth path | ~390 ms listUsers + overhead |
| Enrichment strategy | PostgREST fail → N× `getUserById` |

---

## Changes

1. **PostgREST bypass (default)** — `auth.users` queries run only when `AUDIT_LOG_AUTH_POSTGREST=1` (staging opt-in).
2. **Email search** — Auth Admin `listUsers` only (bounded pages); fills `authEmailsFromSearch`.
3. **Enrichment** — For missing auth IDs: **one batched `listUsers` scan** (early exit when all IDs found), then **`getUserById` only for remaining** (none observed in benchmark).
4. **Request-scoped reuse** — unchanged `authEmailsFromSearch` seed into `getEmailsByAuthUserIds`.
5. **Metrics** — `AuthEmailAdminMetrics` (`listUsersCalls`, `listUsersPages`, `getUserByIdCalls`, `postgrestAttempts`) wired to route perf + benchmark script.

---

## Auth Flow Before

```
Email search / enrichment
  → PostgREST auth.users (~200ms, fail)
  → listUsers scan OR N× getUserById
  → duplicate work search vs enrichment
```

## Auth Flow After

```
Email search (email kind only)
  → listUsers (≤5 pages, collect map)
  → portal users by auth_user_id

Enrichment
  → merge authEmailsFromSearch seed
  → listUsers scan until actor auth IDs resolved
  → getUserById only for still-missing IDs
```

PostgREST: **skipped** unless `AUDIT_LOG_AUTH_POSTGREST=1`.

---

## Search Parity (MEASURED)

| Search | list_rows | total | Auth listUsers |
|--------|-----------|-------|----------------|
| (none) | 25 | 59 | 1 page (enrichment) |
| `report` | **3** | **3** | 0 (no email prequery) |
| `payment` | 17 | 17 | 0 |
| `project` | 10 | 10 | 0 |
| `hamza` | 25 | 59 | 2 pages (search + enrich) |
| `f4.report_created` | 0 | 0 | 0 |

Phase 5 `report` parity (**3 rows**) preserved.

---

## Auth Operation Counts (Phase 6B)

| Case | listUsers calls | pages | getUserById | postgrest |
|------|----------------:|------:|------------:|----------:|
| A default | 1 | 1 | **0** | 0 |
| E report | 1 | 1 | **0** | 0 |
| F hamza | 2 | 2 | **0** | 0 |
| I admin+area | 0 | 0 | **0** | 0 |
| K page 100 | 1 | 1 | **0** | 0 |

**MEASURED:** Default Audit Log page no longer uses per-id `getUserById` for actor emails (was up to N parallel calls in Phase 5/6).

---

## Performance Before / After

**Label:** MEASURED pipeline mirror; network variance applies.

| Case | Phase 5 total | Phase 6B total | Phase 5 auth_emails† | Phase 6B auth_emails† |
|------|---------------|----------------|----------------------|------------------------|
| A default | 1727 | 1864 | ~667 ms | **~526 ms** |
| E report | 1686 | 2212 | ~606 ms | **~476 ms** |
| F hamza | 2715 | 2790 | ~647 ms | **~530 ms** |
| B area UM | 1021 | 994 | ~608 ms | **~485 ms** |

†From `enrichment.auth_emails` op timing in benchmark JSON.

| Improvement | Estimate |
|-------------|----------|
| PostgREST removed | **~200 ms** saved per path that previously attempted it |
| Enrichment Auth | **~120–170 ms** faster (listUsers batch vs getUserById/postgrest fail path) |
| Total request | **Mixed** — dominated by LIST/COUNT/project enrichment; not always lower wall-clock |

---

## Decision

## **PARTIAL — material Auth enrichment improvement**

- **SUCCESS criteria met:** No dead PostgREST on default path; **0 getUserById** on benchmark cases; search parity for `report` / non-email terms; batched listUsers enrichment.
- **Not full SUCCESS on total latency:** End-to-end totals still ~1.7–2.8 s due to LIST/COUNT/MOU-project enrichment and Auth `listUsers` API latency (~480–530 ms per enrichment pass).

---

## Remaining Bottlenecks

| Area | Status |
|------|--------|
| **Auth listUsers API** | ~480–530 ms per enrichment scan |
| **Email search listUsers** | ~390–590 ms when email kind |
| **audit_logs LIST** | ~250–290 ms |
| **audit_logs COUNT** | ~250 ms when required |
| **project/MOU/payment enrichment** | ~400–1500 ms by page size |
| **JSONB/ILIKE search** | Not optimized (Phase 7+) |

---

## Recommended Phase 7

1. **B′ / staging** — search/COUNT at scale (separate track).
2. **Auth** — optional request-level memoization of listUsers page-1 snapshot when multiple listUsers needed same request (careful with correctness).
3. **Non-Auth** — project/MOU batch enrichment and LIST/COUNT only after search path proven at scale.

---

## Files Changed

| File |
|------|
| `src/app/api/users/utils/authEmails.ts` |
| `src/app/api/audit-logs/route.ts` |
| `scripts/audit-log-query-perf-phase4.ts` |
| `docs/AUDIT_LOG_QUERY_PERFORMANCE_PHASE6B.md` |

---

## Validation

- `npx tsx scripts/validate-audit-log-foundation.ts` — **PASSED**
- `npx tsx scripts/audit-log-query-perf-phase4.ts` — **PASSED**
- TypeScript — no new errors in touched files

---

## Safety

No database, Auth user, policy, or production data modifications.
