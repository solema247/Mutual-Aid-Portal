# Phase 5 — Audit Log Enrichment & Email Search Optimization

**Scope:** Application-path only (no schema/index/migration changes). Targets Phase 4 P0: Auth email search + actor email enrichment.

**Measured:** 2026-09-23, production Supabase ref `khavbdocjufkyhwpiniw`, **59** audit rows, read-only pipeline script (same methodology as Phase 4).

---

## Changes

### 1. Search classification (`src/lib/auditLogSearch.ts`)

- Added `AUDIT_NON_EMAIL_SEARCH_TERMS` blocklist (`report`, `payment`, `project`, `user`, `f1`–`f5`, etc.).
- Local-part email detection **without `@`** now requires a **single token** (no `.`) and must not be blocklisted.
- **`@` in input** still forces email classification (full address, `hamza@`, `@domain`).

### 2. Auth email search (`src/app/api/users/utils/authEmails.ts`)

- **Primary:** one PostgREST query `auth.users` with `email ILIKE %term%` (limit 200).
- **Fallback:** bounded `auth.admin.listUsers` scan only when PostgREST auth query **fails** (not when it returns zero rows).
- Optional `collect` map: `id → email` populated during search for reuse.

### 3. Actor email enrichment

- `getEmailsByAuthUserIds(ids, seed?)` merges a **seed map** (from email search) and skips IDs already resolved.
- Fixed batch path: treat empty PostgREST result as success (only missing IDs use Admin `getUserById` fallback).

### 4. Route (`src/app/api/audit-logs/route.ts`)

- Shared `authEmailsFromSearch` map wired through search prequery → enrichment.

---

## Before (Phase 4) vs After (Phase 5)

**Label:** **MEASURED** — service-role pipeline mirror (no HTTP auth). Network variance ±~10%.

| Case | Phase 4 Total | Phase 5 Total | Phase 4 PreQ | Phase 5 PreQ | Phase 4 auth_emails enrich | Phase 5 auth_emails enrich |
|------|---------------|---------------|--------------|--------------|----------------------------|----------------------------|
| A default | 1804 | 1727 | 0 | 0 | ~667 ms | ~606 ms* |
| E `report` | 2043 | **1686** | **804** | **444** | ~620 ms | ~606 ms |
| F local-part | 2532 | 2715† | 810 | 1014 | ~640 ms | ~647 ms |
| I area+`admin` | 806 | **626** | **596** | **414** | ~0 | ~0 |

\*From Phase 5 case A ops (similar to Phase 4).

†Variance; F still runs Auth path by design for `hamza`.

### Auth / DB calls (selected)

| Case | Phase 4 DB# | Phase 5 DB# | Auth prequery (Phase 4 → 5) |
|------|-------------|-------------|-----------------------------|
| E `report` | 7 | **6** | **yes → no** |
| F local-part | 8 | 8 | yes → yes |
| I area+search | 4 | 4 | **yes → no** |

---

## Search Classification (after Phase 5)

| Input | Kind | Auth email prequery |
|-------|------|---------------------|
| Full email / `@` present | `email` | yes |
| `hamza` (local-part) | `email` | yes |
| `report`, `payment`, `project`, `user`, `f4` | `general` | **no** |
| UUID | `uuid` | no |
| `42` | `numeric` | no |
| `f4.report_created` | `action_like` | no |

---

## Auth Work

| Path | Before | After |
|------|--------|-------|
| `report` search | Auth scan ~390 ms + display name | **No Auth scan**; general + grant prequery |
| Email search | Up to 5× `listUsers` pages | **1× ILIKE** when PostgREST auth works; else same fallback |
| Search → enrichment | Separate lookups | **Seed map** reuses emails from search when IDs overlap |
| Enrichment batch | Schema `.in()` then N× `getUserById` | Same, but **skips IDs in seed**; empty schema result no longer forces full refetch incorrectly |

**NOT MEASURED:** Whether PostgREST `auth.users` ILIKE succeeds on all environments (F still showed ~587 ms `auth_email_scan` → likely **fallback scan** on this project).

---

## Result Parity

**MEASURED** (pipeline list row counts / totals):

| Search | list_rows | total |
|--------|-----------|-------|
| (none) | 25 | 59 |
| `report` | **3** | **3** (unchanged vs Phase 4 E) |
| `payment` | 17 | 17 |
| `hamza` | 25 | 59 |
| `f4.report_created` | 0 | 0 (underscore escape unchanged; known correctness issue) |

`report` no longer misclassified as email; audit matches still **3 rows** via action/endpoint/grant ILIKE paths.

---

## Performance Impact

**Wins (measured):**

- **`report`:** −357 ms total, **−360 ms prequery** (Auth scan removed).
- **`area=user_management&search=admin`:** −180 ms total (Auth scan removed; `admin` blocklisted).

**Still costly (measured):**

- **`enrichment.auth_emails`:** ~600–650 ms when enrichment still hits Auth Admin fallback.
- **LIST / COUNT:** ~205–240 ms each (unchanged).
- **Project/MOU/payment enrichment:** ~200–790 ms by page size (unchanged).

---

## Remaining Bottlenecks (do not fix in Phase 5)

1. Auth Admin API latency / fallback when `auth` schema PostgREST is unavailable or partial.
2. `audit_logs` LIST + COUNT at scale (B′ / indexes — Phase 6+).
3. JSONB / broad OR search on `audit_logs`.
4. Batched `fetchEnrichmentLookups` (err_projects, mous, payments).
5. HTTP `requireAuditLogViewer` (not in pipeline script).

---

## Files Changed

| File |
|------|
| `src/lib/auditLogSearch.ts` |
| `src/app/api/users/utils/authEmails.ts` |
| `src/app/api/audit-logs/route.ts` |
| `scripts/audit-log-query-perf-phase4.ts` (seed map + parity snapshot) |
| `scripts/validate-audit-log-foundation.ts` (classification regressions) |
| `docs/AUDIT_LOG_QUERY_PERFORMANCE_PHASE5.md` |

---

## Validation

- `npx tsx scripts/validate-audit-log-foundation.ts` — **PASSED**
- `npx tsx scripts/audit-log-query-perf-phase4.ts` — **PASSED**
- TypeScript: no new errors in touched files (pre-existing project errors elsewhere)

---

## Recommendation for Phase 6

1. **Confirm** `auth.users` PostgREST access in staging (log `querySucceeded` in dev only once) — if blocked, document and consider Supabase-supported Admin filter API only (no public.users email column).
2. **B′ / COUNT / LIST** on staging at row scale (Phase 3G) — separate from email work.
3. **Optional:** defer actor email to lazy UI field if Auth batch remains ~600 ms+ after PostgREST is verified.

---

## Safety

- No database schema, index, migration, or production data modifications.
- No change to authorization, pagination, count policy, or area mappings.
