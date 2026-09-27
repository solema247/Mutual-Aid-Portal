# Audit Log Query Performance — Phase 8A (Action Search Correctness)

**Scope:** Fix underscore handling for **action-like** audit log search only. No B′, indexes, schema, pagination, COUNT, enrichment, area mapping, or auth changes.

**Environment:** Application code + validation; parity re-check on isolated Docker Postgres (`audit_log_phase7_pg`, port 5436). Production data untouched.

---

## Problem

Searching for a structured audit action such as `f4.report_created` returned **zero rows** even when the database contained many rows with `action = 'f4.report_created'`.

Phase 7 isolated benchmark (10k rows): **1,111** rows with exact action `f4.report_created`, but baseline application search matched **0** before this fix.

---

## Root Cause

Transformation path for search term `f4.report_created`:

| Step | Value |
|------|--------|
| User input | `f4.report_created` |
| Classification | `escapeAuditSearchTerm(trimmed)` → `f4.reportcreated` (underscore removed) |
| Kind | `action_like` (still detected via `f4.` prefix) |
| **Predicate `escaped` (before fix)** | Same as classification escape → `f4.reportcreated` |
| PostgREST / SQL | `action ILIKE '%f4.reportcreated%'` |
| Stored `action` | `f4.report_created` |
| **Match** | **No** — ILIKE pattern lacks `_` between `report` and `created` |

`escapeAuditSearchTerm()` intentionally strips `_` because `_` is a SQL `ILIKE` single-character wildcard in **general** text search. That rule was applied to **action-like** predicates as well, which broke exact structured action identifiers.

---

## Fix

**File:** `src/lib/auditLogSearch.ts`

1. Added `escapeAuditActionSearchTerm(raw)` — removes only `%` and `,`; **preserves `.` and `_`**.
2. Updated `parseAuditSearchTerm()`:
   - Classification still uses `escapeAuditSearchTerm(trimmed)` (general semantics unchanged).
   - If `kind === 'action_like'`, set `escaped` to `escapeAuditActionSearchTerm(trimmed)` for ILIKE predicates.

`GET /api/audit-logs` already uses `parseAuditSearchTerm()`; no route change required.

General search (e.g. `report`, `payment`, grant serial) still uses `escapeAuditSearchTerm()` and behaves as before.

---

## Action Search Parity

### Predicate / parse (offline — `scripts/validate-audit-log-foundation.ts` §5e2)

For each representative known action, `parseAuditSearchTerm(action).escaped === action` and `buildAuditLogSearchOrParts` includes `action.ilike.%{action}%`.

| Action | Expected predicate fragment | Actual (parse + OR parts) | Parity |
|--------|----------------------------|---------------------------|--------|
| `f1.workplan_created` | `%f1.workplan_created%` | same | ✓ |
| `f1.feedback_submitted` | `%f1.feedback_submitted%` | same | ✓ |
| `f1.serial_created` | `%f1.serial_created%` | same | ✓ |
| `f2.committed` | `%f2.committed%` | same | ✓ |
| `f2.project_updated` | `%f2.project_updated%` | same | ✓ |
| `f3.mou_created` | `%f3.mou_created%` | same | ✓ |
| `f3.mou_updated` | `%f3.mou_updated%` | same | ✓ |
| `f4.report_created` | `%f4.report_created%` | same | ✓ |
| `f4.reviewed` | `%f4.reviewed%` | same | ✓ |
| `f5.report_created` | `%f5.report_created%` | same | ✓ |
| `user.created` | `%user.created%` | same | ✓ |
| `user.role_changed` | `%user.role_changed%` | same | ✓ |
| `user.permission_changed` | `%user.permission_changed%` | same | ✓ |
| `project.completed` | `%project.completed%` | same | ✓ |
| `project.reporting_status_changed` | `%project.reporting_status_changed%` | same | ✓ |
| `project.implemented_sector_changed` | `%project.implemented_sector_changed%` | same | ✓ |
| `f3.payment_confirmation_created` | `%f3.payment_confirmation_created%` | same | ✓ |
| Partial `f4.report` | `%f4.report%` | same | ✓ |

Payment-related audit keys in this repo use the **`f3.payment_*`** namespace (not `payment_confirmation.created`).

### ID parity (Docker 10k — `scripts/audit-log-query-perf-phase7.ts`)

Search term `f4.report_created`:

| Metric | Expected (DB) | Application baseline search | Parity |
|--------|--------------:|----------------------------:|--------|
| Row count | 1,111 | 1,111 | ✓ |
| Sorted `id` set vs `action = 'f4.report_created'` | — | identical | ✓ (`underscore_bug_id_parity`) |

Counts derived from seeded dataset (1/9 of rows use rotating actions including `f4.report_created`), not hardcoded.

---

## Area + Action Tests

Offline (`resolveEffectiveAuditActions` — unchanged mapping):

| Area | Action filter | Effective actions | Parity |
|------|---------------|-------------------|--------|
| `f4` | `f4.report_created` | `f4.report_created` | ✓ |
| `user_management` | `user.role_changed` | `user.role_changed` | ✓ |
| `permissions` | `user.permission_changed` | `user.permission_changed` | ✓ |
| `f4` | `user.role_changed` | *(empty)* | ✓ |

---

## Regression Tests

| Case | 10k baseline COUNT (after fix) | Notes |
|------|-------------------------------:|-------|
| `report` | 3,334 | General search unchanged |
| `f4` (endpoint/general) | 2,930 | Unchanged |
| `LCC` grant | 1,084 | Unchanged |
| `LCC-KF-CB-0626-0009` | 0 | Unchanged (no exact serial in 10k sample) |
| `f4.report_created` | **1,111** | Was **0** pre-fix |
| UUID probe | 0 | Unchanged |

Artifact: `docs/_phase7_bench.json` (re-run with `--sizes=10000`).

---

## Performance Check

No intentional performance work. Phase 7 @ 10k: `search_action_like_count` baseline ~157 ms (same order as other ILIKE searches). No new indexes or query shape changes beyond correct ILIKE pattern.

---

## Production Safety

- No database schema changes
- No migrations or indexes
- No production data reads/writes for this phase
- Synthetic inserts only in local Docker benchmark container

---

## Validation

```text
npx tsx scripts/validate-audit-log-foundation.ts   → PASSED
npx tsx scripts/audit-log-query-perf-phase7.ts "--sizes=10000"   → underscore parity PASSED
npx tsc --noEmit   → pre-existing errors only (unrelated files):
  - src/components/audit-log/AuditEventDetailsSheet.tsx
  - src/lib/auditLogListEnrichment.ts
```

---

## Files Changed

| File | Change |
|------|--------|
| `src/lib/auditLogSearch.ts` | `escapeAuditActionSearchTerm`, `parseAuditSearchTerm` action branch |
| `scripts/validate-audit-log-foundation.ts` | §5e2 Phase 8A regression tests |
| `scripts/audit-log-query-perf-phase7.ts` | Underscore ID parity metric; comment update |
| `docs/AUDIT_LOG_QUERY_PERFORMANCE_PHASE8A.md` | This document |

---

## Recommendation for Phase 8B

1. **Staging B′** — Apply generated `grant_search_text` + trigram DDL on a non-production database; reshape search to B′ ILIKE arms behind a flag; HTTP/PostgREST benchmarks (Phase 3G-style).
2. **Re-run full Phase 7 sizes** (100k / 500k) after 8A to confirm underscore parity at scale (`11,111` / `55,555` exact `f4.report_created` rows vs search counts).
3. **Production index audit** — Confirm composite `(created_at DESC, id DESC)` on `audit_logs` if not already present.
4. Keep action-like escape on **`escapeAuditActionSearchTerm`** when implementing B′ so structured actions remain correct.
