# Grant Management: Portal-Canonical Migration Plan

This document is the implementation plan for moving **Grants** and **Allocations** on `/err-portal/grant-management` from read-only Airtable foreign tables to **portal-owned Supabase tables**, with **one-way sync Portal → Airtable**.

**Policy (locked in):**

- All edits happen in the Portal only (including Excel upload — never create decisions/allocations directly in Airtable).
- Airtable ingests changes from the Portal; there is **no** inbound sync from Airtable for these entities after cutover.

---

## Current status (2026-07-01)

### Completed

| Phase | Status | Notes |
|-------|--------|-------|
| **A1** — Airtable `Portal_*` raw tables | ✅ Done | `Portal_Decisions`, `Portal_Allocations`, `Portal_Grants` created; table ids recorded |
| **0** — Schema sync columns | ✅ Done | Migration `20260626120000_grant_management_airtable_sync_columns.sql` applied; types on `main` |
| **1** — FDW → canonical backfill | ✅ Done | See [Phase 1 results](#phase-1-results-2026-07-01) below |

### Canonical row counts (post-backfill)

| Table | Rows | vs FDW | Excluded |
|-------|------|--------|----------|
| `grants_grid_view` | **28** | 27 FDW + 1 portal-only (`Avaaz 2`) | — |
| `distribution_decision_master_sheet_1` | **69** | 71 FDW − 2 `#ERROR!` | `recKhnE6o5ktuEteU`, `recxnYC1Zo9rc2t1y` |
| `allocations_by_date` | **530** | 531 FDW − 1 `#ERROR!` | North Darfur ~$485k (broken formula) |

**Allocation total:** canonical **$18,453,345.67** vs FDW **$18,938,345.67** — gap = excluded $485k row only.

**FK:** `allocations_by_date.Decision_ID` → `distribution_decision_master_sheet_1.decision_id_proposed` — **530/530 linked, 0 orphans**; `fk_alloc_decision` enforced (validated 2026-07-01).

### Cutover scripts (app repo)

| Script | Purpose |
|--------|---------|
| `scripts/cutover/backfill-grants-from-fdw.ts` | Grants FDW → `grants_grid_view` |
| `scripts/cutover/backfill-decisions-from-fdw.ts` | Decisions FDW → `distribution_decision_master_sheet_1` |
| `scripts/cutover/backfill-allocations-from-fdw.ts` | Allocations FDW → `allocations_by_date` |
| `scripts/cutover/compare-decisions-fdw-canonical.ts` | Side-by-side decisions reconciliation |
| `scripts/cutover/validate-allocations-fk.ts` | FK orphan + enforcement check |

All backfill scripts: dry-run default; `--inserts-only` / `--updates-only` / `--apply`.

### Not started

| Phase | What |
|-------|------|
| **1.3** (remaining) | Full reconciliation (grant totals, pool summary vs FDW) |
| **3** | Switch grant-management APIs to read canonical instead of FDW |
| **2** | Portal push → Airtable `Portal_*` raw tables |
| **4** | Enable grant-management UI edits + Excel upload |
| **A2** | Airtable automations raw → existing display tables |
| **5** | End-to-end test plan |

### Immediate next step

**Phase 1.3 validation** (remaining gates) → then **Phase 3** (API read path to canonical). UI still reads FDW today.

---

## Goals

| Area | Today | Target |
|------|--------|--------|
| Grants (`GrantCallsManager`) | Read `public.grants` (Airtable FDW); edit disabled | Read/write `grants_grid_view`; push to Airtable on mutation |
| Allocations | Read `public.allocations` + `public.distribution_decision` (FDW) | Read/write `distribution_decision_master_sheet_1` + `allocations_by_date`; Excel upload restored; push to Airtable on mutation |
| Pool summary cards | Mixed sources (FDW for totals, local for by-state) | Single source: canonical tables |
| Sync direction | Airtable → Portal (FDW reads; optional `/api/airtable/sync`) | Portal → Airtable only |

---

## Airtable & FDW reference (living doc)

> Updated as we audit. Paste query results into chat; findings get recorded here before Phase 0.

### Base & tables

| Item | Value |
|------|--------|
| Airtable base ID | `appq9qjlnEW7d0tqZ` |
| FDW `public.grants` | Airtable table id `tbla1FnD7fNMY2q77` |
| FDW `public.distribution_decision` | Airtable table id `tblsdYJyH7SUTwVkm` (API name `Distribution_Decision` in `/api/airtable/sync`) |
| FDW `public.allocations` | Airtable table id `tblsNejy5kmkflLoN` |
| MCP read-only SQL | Can read `information_schema` + **canonical** tables; **cannot** `SELECT` FDW rows (vault decrypt error) |
| FDW row reads | Use **Supabase SQL editor** (service/postgres role) or app `getSupabaseAdmin()` |

### FDW column inventory (from `information_schema`, 2025-06-26)

**`public.grants`** — no Airtable `rec…` column; natural key is `grant_id` (text).

| Column | Type |
|--------|------|
| `grant_id` | text |
| `project_name` | text |
| `donor_name` | jsonb |
| `partner_name` | jsonb |
| `grant_start_date`, `grant_end_date` | date |
| `status` | text |
| `project_id` | text |
| `total_transferred_amount_usd`, `sum_activity_amount`, `sum_transfer_fee_amount` | numeric |
| `transfer_segment`, `allocations`, `activities` | jsonb |

**`public.distribution_decision`** — `id` (text) is the Airtable record id (`rec…`).

| Column | Type |
|--------|------|
| `id` | text ← **airtable_record_id** |
| `decision_id` | text |
| `decision_id_proposed` | jsonb |
| `partner`, `grant_name`, `fund_request`, `transfer_segment`, `allocation_id` | jsonb |
| `decision_amount`, `sum_allocation_amount`, `variance` | numeric |
| `decision_date` | date |
| `file_name`, `file_link`, `notes`, `restriction` | text |

**`public.allocations`**

| Column | Type |
|--------|------|
| `allocation_id` | jsonb ← shape TBD (business key vs `rec…`) |
| `decision_id` | jsonb ← link to decision; app expects `["rec…"]` |
| `decision_date`, `decision_amount`, `grant_id`, `partner` | jsonb |
| `state`, `decision_maker`, `restriction`, `notes`, `status`, `flow_oversight` | text |
| `allocation_amount`, `percent_decision_amount`, `serial` | numeric |
| `sequence` | text |

### Canonical baseline (pre-backfill, 2025-06-26)

| Table | Rows | Notable total |
|-------|------|----------------|
| `grants_grid_view` | 25 | `sum(sum_activity_amount)` = **9,411,633.78** |
| `distribution_decision_master_sheet_1` | 39 | — |
| `allocations_by_date` | 338 | `sum("Allocation Amount")` = **7,954,208.95** |

Phase 0 columns (`airtable_record_id`, `sync_status`, `last_pushed_at`) — **applied 2026-06-26** (see Phase 0).

### FDW vs canonical — Q1 results (pre-backfill, 2025-06-26)

| Check | FDW (Airtable) | Canonical (portal) | Delta | Match? |
|-------|----------------|-------------------|-------|--------|
| Grant count | **27** | 25 | +2 FDW | No |
| Grant `sum_activity_amount` | **16,980,783.51** | 9,411,633.78 | +7.57M (~80% higher on FDW) | No |
| Grant `sum_transferred` | **17,333,771.60** | 9,620,666.46 | +7.71M | No |
| Decision count | **69** | 39 | +30 FDW | No |
| Allocation count | **522** | 338 | +184 FDW | No |
| Allocation total | **17,938,345.66** | 7,954,208.95 | +9.98M (~125% higher on FDW) | No |

**Interpretation:** Airtable (FDW) is substantially ahead of canonical tables on every metric. Canonical data is **stale / partial** — not safe to switch UI reads without a full FDW → canonical backfill. Pool summary cards today (FDW-based) show ~$17.9M allocated; canonical would show ~$8.0M.

**Likely causes:** Grant-management UI was moved to FDW reads; inbound sync to `distribution_decision_master_sheet_1` is not keeping pace; `grants_grid_view` / `allocations_by_date` continued to be used only by other features with older snapshots.

**Next audit:** Q6 + Q7 to list which grant_ids / decision ids / allocation ids exist only on one side.

### Q2–Q5 sample findings (2025-06-26)

#### Grants (`public.grants`) — Q2

| Field | FDW shape | Backfill / push note |
|-------|-----------|----------------------|
| `grant_id` | Text business key, e.g. `Malala Fund`, `FCDO 3` | Upsert key on `grants_grid_view.grant_id` |
| `donor_name` | jsonb **array of donor `rec…` ids**, e.g. `["recqxn6YoiPQB4rVc"]` | **Not a display name.** Resolve via `public.donors` if linked, or Airtable Donors table; canonical `donor_name` is plain text today |
| `partner_name` | jsonb array of partner `rec…` ids (same partner rec repeated) | Same — resolve to text or store link separately |
| `status` | `Active` (capital A) | Normalize to canonical convention (`active` vs `Active`) during backfill |
| Airtable grant `rec…` | **Not exposed on FDW row** | Populate `airtable_record_id` via **Airtable API** lookup by `grant_id` field at backfill, or on first push |

#### Distribution decisions — Q3

| Field | FDW shape | Backfill / push note |
|-------|-----------|----------------------|
| `id` | `rec…` (e.g. `recypURCzqOAyKgEf`) | → `airtable_record_id` |
| `decision_id` | Often **null** on recent rows | Mirror `decision_id_proposed` into `decision_id` when null |
| `decision_id_proposed` | jsonb **string**, e.g. `"LCC.P2H.2026-06-03.Flex"` | → `decision_id_proposed` (strip quotes) |
| `grant_name` | null in samples | Optional on canonical |
| `decision_date` | SQL `date` | Direct map |
| `restriction` | text, e.g. `Flexible`, `CHAD`, `Emergency` | Direct map |

#### Allocations — Q4 + Q5

| Field | FDW shape (521/522 rows) | Backfill / push note |
|-------|--------------------------|----------------------|
| `allocation_id` | jsonb **string** = business key, e.g. `LCC.AD.P2H.26-05-04.515` | → `allocations_by_date."Allocation_ID"` |
| `allocation_id` (1 row) | jsonb **object** `{"error":"#ERROR!"}` | **Broken Airtable formula** — flag in backfill log; fix in Airtable or exclude |
| `decision_id` | jsonb **array** of one `rec…`, e.g. `["recF4HZ2ppy94PvvU"]` | Join to `distribution_decision.id` → get `decision_id_proposed` → `Decision_ID` |
| `decision_date` | jsonb array of one date string, e.g. `["2026-05-04"]` | → `Decision_Date` (first element) |
| `grant_id` | **Always null** (Q5: 522/522) | Do not use for backfill |
| `percent_decision_amount` | Often null in samples | Recompute from amount / decision_amount if needed |
| `serial` | numeric | → `Serial` |
| Airtable allocation `rec…` | **Not in `allocation_id` field** | Populate `airtable_record_id` via **Airtable API** filter on `Allocation_ID` at backfill |

#### Confirmed jsonb types (Q5)

```
allocation_id:  string × 521, object × 1 (#ERROR!)
decision_id:    array × 522
grant_id:       null × 522
```

### jsonb parsing helpers (for backfill script)

```sql
-- jsonb → single text (string or single-element array)
trim(both '"' from (
  CASE jsonb_typeof(col)
    WHEN 'string' THEN col #>> '{}'
    WHEN 'array'  THEN col->>0
    ELSE col::text
  END
))

-- decision link rec id from allocations.decision_id
trim(both '"' from (decision_id->>0))

-- skip broken allocation rows
WHERE jsonb_typeof(allocation_id) = 'string'
  AND allocation_id::text NOT LIKE '%error%'
```

### Audit progress

- [x] Q1 counts/totals
- [x] Q2 grants samples
- [x] Q3 decisions samples
- [x] Q4 allocations samples
- [x] Q5 jsonb type survey
- [x] Q6 grants diff
- [x] Q7 decisions + allocations diff
- [x] Q8 Airtable API field map — **complete** (Grants, Distribution_Decision, Allocations)

### Q6 — Grants diff (2025-06-26)

**FDW only (3)** — must be inserted into `grants_grid_view` at backfill:

| grant_id | project_name |
|----------|----------------|
| Crushing Family Foundation | Crushing Family Foundation |
| Silicon Valley Foundation | Silicon Valley Foundation |
| Skoll Foundation | Skoll Foundation |

**Canonical only (1)** — not in Airtable FDW; investigate before backfill:

| grant_id | project_name | status |
|----------|--------------|--------|
| Avaaz 2 | Mutual Aid Sudan | active |

**Action:** Check if `Avaaz 2` is referenced by `err_projects` / F2 flows. If yes, keep row (portal-only grant or renamed in Airtable). If no, archive or delete after cutover. Do **not** delete blindly during FDW backfill.

### Q7 — Decisions diff (2025-06-26)

| Side | Count | Notes |
|------|-------|-------|
| `fdw_only` | **~30** | Mostly 2025-12 → 2026 P2H/Avaaz decisions; all have `decision_id` null, keyed by `decision_id_proposed` |
| `canonical_only` | **1** | `decision_id` = `LCC.P2H.2025-10-22.Flex` but `decision_id_proposed` = `LCC.P2H.2025-10-22.Flex-2` — **id mismatch** on same logical decision |

**Broken Airtable formulas (decisions):** 2 FDW rows with `proposed_text` = `{"error": "#ERROR!"}`:

- `recxnYC1Zo9rc2t1y`
- `recKhnE6o5ktuEteU`

Fix in Airtable before cutover or exclude from backfill and log.

### Q7 — Allocations diff (2025-06-26)

| Metric | Value |
|--------|-------|
| `fdw_only_count` | **184** |
| `canonical_only_count` | **0** |

All 184 missing allocation rows are on the FDW side — canonical has **no orphan** allocations vs Airtable. Backfill is **insert-only** for allocations (no canonical rows to delete).

**Broken row:** 1 allocation with `alloc_key` = `{"error": "#ERROR!"}` (North Darfur, $485,000) — ties to broken decision `recxnYC1Zo9rc2t1y`.

**State name note:** FDW uses `Sinar` in some rows; portal canonical often uses `Sennar` — apply existing state normalization in backfill (`normalizeActivitiesStateName` / state mappings).

### Backfill strategy (updated after Q6–Q7) — **applied 2026-07-01**

1. **Grants:** ✅ Upserted 27 FDW rows; inserted 3 new donors/grants; preserved `Avaaz 2`.
2. **Decisions:** ✅ 30 inserts + 39 updates; `airtable_record_id` from FDW `id`; Flex duplicate → `Flex-2` suffix row via `airtable_record_id` match.
3. **Allocations:** ✅ 192 inserts + 337 updates; `Decision_ID` resolved via decision `airtable_record_id`; state normalization applied; `%_Decision_Amount` corrected to percent scale.
4. **Excluded:** 2 decision + 1 allocation `#ERROR!` rows (per policy — fix in Airtable later).
5. Post-backfill: row-level match on synced fields ✅; allocation FK ✅; financial total gap = excluded $485k only.

Run in **Supabase → SQL editor**. Copy each result set into chat (CSV or table). Redact if needed.

See section **Appendix: Airtable audit SQL** at the bottom of this file.

---

## Canonical tables

| Entity | Canonical table | Natural key | Notes |
|--------|-----------------|-------------|-------|
| Grants | `grants_grid_view` | `grant_id` | Already used by F2, F3, project management |
| Distribution decisions | `distribution_decision_master_sheet_1` | `decision_id_proposed` (unique) | Links to allocations via `decision_id` / proposed id |
| State allocations | `allocations_by_date` | `Allocation_ID` | FK to decisions on `Decision_ID` → `decision_id_proposed` |

---

## Current split-brain (why cutover matters)

Grant management UI was repointed to Airtable FDW while other portal features kept using local tables. **Phase 1 backfill (2026-07-01) closed the data gap** — canonical tables now mirror FDW for grants, decisions, and allocations (except excluded `#ERROR!` rows). **UI and APIs still read FDW** until Phase 3.

We ran a **one-time backfill** from FDW into canonical tables **before** switching the UI read path. ✅ Complete.

---

## Phase 0: Schema preparation — ✅ complete (2026-06-26)

**Repo:** `sudan-err-portal-schema` (requires approval per `docs/db-workflow.md`).

### Why these three columns?

Supabase is the **source of truth**. Airtable raw tables are a **copy**. Each canonical row needs to remember its relationship to Airtable and whether the copy is up to date.

| Column | Purpose | Example |
|--------|---------|---------|
| `airtable_record_id` | The Airtable `rec…` id for the matching row in `Portal_*` raw table. Needed to **update** or **delete** the right Airtable row later (not search by name every time). | `recABC123xyz` |
| `sync_status` | Is this row mirrored to Airtable? `synced` = ok, `pending` = portal saved but Airtable push failed or not run yet, `failed` = gave up / needs attention. | `pending` |
| `last_pushed_at` | When we last successfully pushed (or last attempted). For debugging and retries. | `2026-06-26T14:30:00Z` |

**Flow:** User saves in portal → row written to Supabase → push to Airtable raw table → Airtable returns `rec…` → we store it in `airtable_record_id` and set `sync_status = 'synced'`.

Without these columns, the portal would not know which Airtable record to update on the second edit.

Add columns to support Airtable push and cutover:

**Migration file:** `sudan-err-portal-schema/supabase/migrations/20260626120000_grant_management_airtable_sync_columns.sql`

```sql
-- grants_grid_view
ALTER TABLE grants_grid_view
  ADD COLUMN IF NOT EXISTS airtable_record_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_pushed_at timestamptz;

-- distribution_decision_master_sheet_1
ALTER TABLE distribution_decision_master_sheet_1
  ADD COLUMN IF NOT EXISTS airtable_record_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_pushed_at timestamptz;

-- allocations_by_date
ALTER TABLE allocations_by_date
  ADD COLUMN IF NOT EXISTS airtable_record_id text,
  ADD COLUMN IF NOT EXISTS sync_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS last_pushed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS uq_grants_grid_airtable_rec
  ON grants_grid_view (airtable_record_id) WHERE airtable_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_dd_master_airtable_rec
  ON distribution_decision_master_sheet_1 (airtable_record_id) WHERE airtable_record_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_alloc_by_date_airtable_rec
  ON allocations_by_date (airtable_record_id) WHERE airtable_record_id IS NOT NULL;
```

Optional: `sync_outbox` table for failed Airtable pushes (retry cron). Can be Phase 2 if we start with inline push + logging.

**App repo:** regenerate `src/lib/database.types.ts` after schema apply.

---

## Phase 1: One-time cutover — canonical tables get latest data — ✅ backfill complete (2026-07-01)

This answers: *How do we ensure canonical tables have the latest data when we make the switch?*

### Phase 1 results (2026-07-01)

| Entity | Script | Inserts | Updates | Canonical rows | FDW synced | Excluded |
|--------|--------|---------|---------|----------------|------------|----------|
| Grants | `backfill-grants-from-fdw.ts` | 3 | 15 | 28 | 27 | `Avaaz 2` kept |
| Decisions | `backfill-decisions-from-fdw.ts` | 30 | 39 | 69 | 69 | 2 `#ERROR!` |
| Allocations | `backfill-allocations-from-fdw.ts` | 192 | 337 | 530 | 530 | 1 `#ERROR!` ($485k) |

**Decisions — Flex duplicate:** Two FDW rows share proposed id `LCC.P2H.2025-10-22.Flex`. Canonical uses `…Flex` and `…Flex-2` (unique `decision_id_proposed`); matched by `airtable_record_id` (`recAvT5U…` / `recsZuJx…`).

**Allocations — decision link:** FDW `decision_id` `["rec…"]` → canonical `Decision_ID` = parent `decision_id_proposed` via decisions’ `airtable_record_id`.

**Allocations — `%_Decision_Amount`:** Canonical had fractional values (e.g. `0.06`); backfill set true percent (e.g. `6.18`) from FDW or `amount / decision_amount`.

**`airtable_record_id` after backfill:** Set on all decisions from FDW `id`. Grants and allocations: FDW has no `rec…` column on those tables — left `null`, `sync_status = pending` until Phase 2 push or API lookup.

### 1.1 Pre-cutover checklist

- [ ] Announce **freeze on Airtable edits** for Grants, Distribution Decision, and Allocations tables (coordinate with Airtable users). *Deferred — preview mode; backfill run without freeze.*
- [x] Confirm FDW reflects Airtable (backfill dry-runs matched prod FDW).
- [x] Export row counts and key totals from **both** FDW and canonical tables for comparison baseline.

### 1.2 Backfill scripts (one-time) — ✅ run in prod

Separate scripts per entity (not a single monolithic file):

**Source:** `public.grants`, `public.distribution_decision`, `public.allocations` (FDW), using service role via `.env.local`.

**Target:** canonical tables above.

**Grants** (`public.grants` → `grants_grid_view`):

| FDW field | Canonical field |
|-----------|-----------------|
| (match existing uuid by `grant_id`) | `id` |
| `grant_id` | `grant_id` |
| `project_name` | `project_name` |
| `donor_name` (jsonb `rec…` → resolve to text / `donor_id`) | `donor_name`, `donor_id` |
| `partner_name` (jsonb `rec…` → resolve to text) | `partner_name` |
| `grant_start_date` / `grant_end_date` | same |
| `status` (normalize casing) | `status` |
| `total_transferred_amount_usd` | `total_transferred_amount_usd` |
| `sum_activity_amount` | `sum_activity_amount` |
| `sum_transfer_fee_amount` | `sum_transfer_fee_amount` |
| Airtable grant `rec…` via **API lookup** by `grant_id` | `airtable_record_id` |

Upsert on `grant_id`. **Do not overwrite** portal-only fields on existing rows if they are maintained elsewhere (e.g. `activities`, `max_workplan_sequence`) — merge strategy: FDW financial/display fields win for grant-management columns; preserve uuid `id` and project links.

**Distribution decisions** (`public.distribution_decision` → `distribution_decision_master_sheet_1`):

| FDW field | Canonical field |
|-----------|-----------------|
| FDW `id` (`rec…`) | `airtable_record_id` |
| `decision_id` OR `decision_id_proposed` when `decision_id` is null | `decision_id` |
| `decision_id_proposed` (jsonb string → text) | `decision_id_proposed` |
| `grant_name`, `restriction`, `decision_date`, `sum_allocation_amount`, etc. | same |

Upsert on `decision_id_proposed` (or `decision_id` where proposed is null). Preserve existing uuid `id` when row already exists.

**Allocations** (`public.allocations` → `allocations_by_date`):

| FDW field | Canonical field |
|-----------|-----------------|
| `allocation_id` (jsonb string; skip `#ERROR!` object row) | `Allocation_ID` |
| `state` | `State` |
| `allocation_amount` | `Allocation Amount` |
| `percent_decision_amount` OR computed | `%_Decision_Amount` |
| `restriction` | `Restriction` |
| `decision_date` (jsonb array → date) | `Decision_Date` |
| `decision_id` (array `rec…` → decision lookup) | `Decision_ID` = parent `decision_id_proposed` |
| `serial` | `Serial` |
| Airtable allocation `rec…` via **API lookup** by `Allocation_ID` | `airtable_record_id` |

Resolve `decision_id` link: map FDW decision record id → `distribution_decision_master_sheet_1.decision_id_proposed` via `airtable_record_id` from step above.

Upsert on `Allocation_ID`.

### 1.3 Validation gates (must pass before UI switch)

| Check | Status (2026-07-01) |
|-------|---------------------|
| Decision count vs FDW (excl. errors) | ✅ 69 = 71 − 2 |
| Allocation count vs FDW (excl. errors) | ✅ 530 = 531 − 1 |
| Allocation total vs FDW (excl. errors) | ✅ Gap = $485k excluded row only |
| Orphan allocations (`Decision_ID` FK) | ✅ 0 orphans; `fk_alloc_decision` enforced |
| Grant count vs FDW | ✅ 27 synced + `Avaaz 2` portal-only |
| Grant financial totals | ⏳ Not re-run post-backfill |
| Pool summary vs FDW totals | ⏳ UI still on FDW — run after Phase 3 |
| Decisions field-level reconciliation | ✅ `compare-decisions-fdw-canonical.ts` — 69/69 matched |

Run a reconciliation report comparing FDW vs canonical:

| Check | Query idea |
|-------|------------|
| Grant count | `count(*)` on both sides |
| Grant total transferred | `sum(sum_activity_amount)` or agreed metric |
| Decision count | match by `decision_id_proposed` |
| Allocation count | match by `Allocation_ID` |
| Allocation total | `sum(allocation_amount)` vs `sum("Allocation Amount")` |
| Orphan allocations | every `allocations_by_date.Decision_ID` exists in decisions |
| Pool summary | `/api/pool/summary` totals match pre-cutover FDW-based totals |

Log discrepancies to `logs/cutover-grant-management.log`. **Do not proceed** if financial totals diverge beyond an agreed tolerance (e.g. $0 or rounding).

### 1.4 Cutover window (ordered steps)

1. ~~Freeze Airtable edits~~ *deferred for preview*.
2. ~~Run backfill script.~~ ✅ Done (2026-07-01).
3. Run **remaining** validation gates; fix mapping bugs if needed. ⏳ In progress.
4. Deploy API changes that read canonical tables (UI still on old path — optional dark launch). **← next**
5. Switch grant-management page components to canonical read path.
6. Enable write UI.
7. Run smoke test: one grant edit, one decision + allocation create, confirm Airtable reflects changes.
8. Lift Airtable edit freeze; document that Airtable is **read-only mirror** for these tables.

### 1.5 Rollback

Keep FDW tables untouched. If cutover fails before write enablement, revert UI to `DistributionDecisionTableView` + read-only `GrantCallsManager`. Canonical backfill is idempotent — safe to re-run.

---

## Airtable architecture (decided)

**Portal is the only place users create/edit** decisions, allocations, and grants (including Excel upload).

### Layers

```
1. Portal + Supabase (canonical)   ← source of truth (focus now)
2. Raw Airtable tables (Portal_*)    ← create now (Phase A1)
3. Existing Airtable tables          ← leave alone; wire later (Phase A2)
```

### Phase A1 — now: create raw tables only

Create three **new** tables. Plain fields only — **no automations**, **no changes** to existing tables.

Record each table’s **table id** (`tbl…`) when done.

### Phase A2 — later: wire raw → existing

Automations copy raw values into existing writable fields. Existing formulas/rollups unchanged. Detail deferred until portal + canonical work is further along.

### Portal push target (when code ships)

| Raw table | Existing table (wire in A2) |
|-----------|----------------------------|
| `Portal_Grants` | `Grants` |
| `Portal_Decisions` | `Distribution_Decision` |
| `Portal_Allocations` | `Allocations` |

### Excel upload flow

Parse in portal → save canonical → (later) push to raw tables.

---

## Phase A1 — Create raw tables (do this now)

Do **not** modify `Grants`, `Distribution_Decision`, or `Allocations`. No automations yet.

### `Portal_Decisions`

| Field | Type |
|-------|------|
| `decision_id_proposed` | Single line text *(primary)* |
| `decision_id` | Single line text |
| `decision_amount` | Number |
| `decision_date` | Date |
| `restriction` | Single select |
| `partner` | Link to Partners *(or text)* |
| `grant_name` | Single line text |
| `notes` | Long text |
| `file_name` | Single line text |
| `file_link` | URL |
| `portal_id` | Single line text |
| `display_record_id` | Single line text *(empty until A2)* |

### `Portal_Allocations`

| Field | Type |
|-------|------|
| `allocation_id` | Single line text *(primary)* |
| `portal_decision` | Link to `Portal_Decisions` |
| `state` | Single select |
| `allocation_amount` | Number |
| `restriction` | Single select *(optional)* |
| `decision_date` | Date *(optional)* |
| `portal_id` | Single line text |
| `display_record_id` | Single line text *(A2)* |

### `Portal_Grants`

| Field | Type |
|-------|------|
| `grant_id` | Single line text *(primary)* |
| `project_name` | Single line text |
| `status` | Single select — `Active`, `Complete` |
| `grant_start_date` / `grant_end_date` | Date |
| `donor` | Link to Donors *(or text)* |
| `partner` | Link to Partners *(or text)* |
| `project_id` | Single line text |
| `portal_id` | Single line text |
| `display_record_id` | Single line text *(A2)* |

### Phase A1 done when

- [x] All three tables exist
- [x] Table ids recorded below
- [x] Existing tables untouched

**Raw table ids:**

| Table | Table id |
|-------|----------|
| `Portal_Decisions` | `tblhz3Z6pxPLV5oAk` |
| `Portal_Allocations` | `tbl1NK1FeLHgE5EqE` |
| `Portal_Grants` | `tbli1ZenMu9K8obSb` |

---

## Phase A2 — Wire to existing tables (deferred)

See audit notes: automations write existing **writable** fields only; do not change display table schemas. Revisit when ready to mirror portal edits into `Grants` / `Distribution_Decision` / `Allocations`.

---
## Phase 2: Airtable push layer (Portal → raw tables only)

**New module:** `src/lib/airtable/push.ts` (and `fieldMaps.ts`).

Use existing env pattern from `/api/airtable/sync`:

- `AIRTABLE_BASE_ID` = `appq9qjlnEW7d0tqZ`
- `Airtable_Personal_Access_Token`

### 2.1 Push functions

| Function | When | Airtable table (raw) |
|----------|------|----------------------|
| `pushGrant(record)` | create / update / delete grant | `Portal_Grants` |
| `pushDecision(record)` | create / update / delete decision | `Portal_Decisions` |
| `pushAllocation(record, decisionRawId)` | create / update / delete allocation | `Portal_Allocations` |

**Create flow:** insert canonical → push raw → store raw `rec…` in `airtable_record_id` → automation creates display row (no portal action).

**Update flow:** PATCH raw row by `airtable_record_id`.

**Delete flow:** delete raw row (define automation policy for display row: delete or archive).

**Do not push** to `Grants`, `Distribution_Decision`, or `Allocations` directly.

### 2.2 Failure handling

Recommended for v1:

1. Persist to canonical table first (transaction).
2. Attempt Airtable push.
3. On failure: set `sync_status = 'pending'`, log via `syncLogger`, return success to user with non-blocking warning (or 207-style payload).

Phase 2b (optional): cron `/api/airtable/push-retry` drains `sync_status = 'pending'` rows.

### 2.3 Disable inbound sync

- Remove or stop scheduling `Distribution_Decision` pull in `/api/airtable/sync` for grant-management tables (or remove those entries from `TABLES` array entirely).
- Document that Airtable must not be edited for these entities post-cutover.

---

## Phase 3: API routes

### 3.1 Grants — `/api/grants`

| Method | Action |
|--------|--------|
| `GET` | Read from `grants_grid_view` (replace FDW `public.grants`) |
| `POST` | Insert `grants_grid_view` → `pushGrant` |
| `PUT` | Update by `id` → `pushGrant` |
| `DELETE` | Delete → `pushGrant` delete |

`GrantCallsManager` today writes directly to Supabase client for mutations; **refactor to API routes** so Airtable push stays server-side.

### 3.2 Distribution decisions — `/api/distribution-decisions`

| Method | Action |
|--------|--------|
| `GET` | Read from `distribution_decision_master_sheet_1` (restore; replace FDW read) |
| `POST` | **Restore** — create decision, optional file metadata, → `pushDecision` |

`DELETE` already exists on `[decisionId]` — add `pushDecision` delete.

### 3.3 Allocations

| Route | Action |
|-------|--------|
| `GET /api/allocations` | Read from `allocations_by_date` + join decisions for labels (replace FDW) |
| `POST …/[decisionId]/allocations` | Extend existing handler with `pushAllocation` per row |
| `PUT/DELETE …/allocations/[allocationId]` | Extend existing handlers with Airtable push |

### 3.4 Pool APIs (consistency)

| Route | Change |
|-------|--------|
| `GET /api/pool/summary` | `total_included` from `allocations_by_date`; `total_grants` from `grants_grid_view` |
| `GET /api/pool/by-state` | Already uses `allocations_by_date` — no change |

---

## Phase 4: UI

### 4.1 Grants (`GrantCallsManager`)

- [ ] Set `GRANTS_TABLE_EDIT_ENABLED = true` (or replace with `can('grant_edit')` permission).
- [ ] Reads already go through `/api/grants` — will pick up canonical data after Phase 3.
- [ ] Route create/update/delete through `/api/grants` instead of direct `supabase.from('grants_grid_view')`.

### 4.2 Allocations

- [ ] Replace `DistributionDecisionTableView` with `DistributionDecisionsManager` on `grant-management/page.tsx` (or merge read layout + manager actions).
- [ ] Excel/CSV upload: already in `DistributionDecisionsManager` — template cells B2, C3:P3, C36:P36; verify template unchanged with stakeholders.
- [ ] Re-test create decision + bulk allocation flow end-to-end.

### 4.3 Copy / explainer

- [ ] Update `GrantManagementPageExplainer` if it references Airtable read-only behaviour.
- [ ] i18n strings if needed.

---

## Phase 5: Testing

### Automated / script checks

- [ ] Cutover reconciliation script (Phase 1.3) in CI or runbook.
- [ ] API integration tests for grant CRUD + allocation CRUD (mock Airtable).

### Manual test plan

| # | Scenario | Expected |
|---|----------|----------|
| 1 | Load grant-management page | Grants and allocations match pre-cutover totals |
| 2 | Create grant | Row in `grants_grid_view` + new row in Airtable |
| 3 | Edit grant amounts | Both sides updated |
| 4 | Delete grant | Removed both sides |
| 5 | Create decision manually | Decision in both systems |
| 6 | Upload Excel allocations | Parser populates states; allocations in both systems |
| 7 | Edit single allocation | Updated both sides; decision `sum_allocation_amount` correct |
| 8 | Delete decision | Cascading allocations removed both sides |
| 9 | Pool summary cards | Match sum of canonical tables |
| 10 | F2 / project management | Still resolves grants via `grants_grid_view` |
| 11 | Simulate Airtable API failure | Portal save succeeds; `sync_status = pending`; retry works |

---

## Implementation order (summary)

```
Phase A1 Airtable: create Portal_* raw tables only              [DONE]
Phase A2 Airtable: wire raw → existing (automations)          [later]
Phase 0  Schema (airtable_record_id, sync_status)             [DONE]
Phase 1  Backfill FDW → canonical + validation              [backfill DONE; validation partial]
Phase 3  API routes read canonical                              [NEXT]
Phase 2  push.ts → raw tables only                            [app repo]
Phase 4  UI switch + Excel restore                            [app repo]
Phase 5  Test                                                 [both]
```

Deploy order: **A1 → 0 → 1 → 3 (reads) → 2+3 (writes) → A2 (when ready) → 4 → 5**.

### Immediate next step

**Phase 1.3** — finish remaining validation (grant totals, pool summary). Then **Phase 3** — switch `/api/grants`, `/api/allocations`, `/api/distribution-decisions` to read canonical tables.

### After that (concise)

| Step | What | Status |
|------|------|--------|
| **A1** | Portal_* raw tables in Airtable | ✅ |
| **0** | Supabase migration: `airtable_record_id`, `sync_status` | ✅ |
| **1** | Backfill FDW → canonical | ✅ |
| **3** | APIs read canonical | ⏳ next |
| **2** | Portal push → raw tables | pending |
| **A2** | Automations: raw → existing tables | pending |
| **4** | Enable UI + Excel | pending |
| **5** | Test | pending |

---

## Open items (resolve during Phase 0)

- [x] FDW table ids for grants, distribution_decision, allocations (see Airtable & FDW reference).
- [x] `distribution_decision.id` = Airtable `rec…` record id.
- [x] `grants` FDW has **no** `rec…` column — push/backfill keyed on `grant_id`.
- [x] Raw shape of `allocations.allocation_id` — **business key string** (521/522); 1 broken `#ERROR!` row.
- [x] `allocations.decision_id` — always array of one decision `rec…`.
- [x] `distribution_decision.decision_id` often null — use `decision_id_proposed`.
- [x] `grants.donor_name` / `partner_name` — link `rec…` arrays, not display text.
- [ ] `airtable_record_id` for **grants** — still null on canonical; FDW has no `rec…`; populate at Phase 2 push or Airtable API lookup.
- [x] `airtable_record_id` for **decisions** — set from FDW `id` during Phase 1 backfill.
- [ ] `airtable_record_id` for **allocations** — still null on canonical; FDW has no `rec…`; populate at Phase 2 push or Airtable API lookup.
- [x] Q1 FDW vs canonical counts/totals — **major mismatch** (see table above).
- [x] Q6/Q7 — row-level diff complete (see sections above).
- [ ] Confirm exact Airtable **API field names** for push — **done (Q8)**; see field reference section.
- [ ] Decide permission: reuse admin/support roles or add `grant_edit` / `allocation_edit`.
- [x] Airtable mirror strategy — **raw tables + automations**; existing table **schemas frozen** (automations write existing writable fields only).
- [ ] Decide user-visible behaviour when Airtable push fails (toast warning vs hard error).

---

## Files likely touched

| File | Change |
|------|--------|
| `src/app/err-portal/grant-management/page.tsx` | Swap allocations component |
| `src/app/err-portal/grant-management/components/GrantCallsManager.tsx` | Enable edit; API mutations |
| `src/app/api/grants/route.ts` | CRUD + canonical read |
| `src/app/api/allocations/route.ts` | Canonical read |
| `src/app/api/distribution-decisions/route.ts` | Restore POST; canonical GET |
| `src/app/api/distribution-decisions/[decisionId]/allocations/route.ts` | Airtable push |
| `src/app/api/pool/summary/route.ts` | Canonical sources |
| `src/app/api/airtable/sync/route.ts` | Remove grant-management inbound entries |
| `src/lib/airtable/push.ts` | **New** |
| `scripts/cutover/backfill-grants-from-fdw.ts` | ✅ Created + applied |
| `scripts/cutover/backfill-decisions-from-fdw.ts` | ✅ Created + applied |
| `scripts/cutover/backfill-allocations-from-fdw.ts` | ✅ Created + applied |
| `scripts/cutover/compare-decisions-fdw-canonical.ts` | ✅ Created |
| `scripts/cutover/validate-allocations-fk.ts` | ✅ Created |

---

## Related docs

- `docs/db-workflow.md` — schema change process
- `docs/SYNC_LOGGING.md` — logging pattern for sync jobs
- `ARCHITECTURE.md` — grant management page location

---

## Appendix: Airtable audit SQL

Run in **Supabase SQL editor** (not MCP). Share results in chat in order **Q1 → Q7**.

### Helper: normalize jsonb text (used in several queries)

```sql
-- Use inline: jsonb_scalar(val) returns a single text value from jsonb string/array
CREATE OR REPLACE FUNCTION pg_temp.jsonb_scalar(val jsonb)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN val IS NULL OR val = 'null'::jsonb THEN NULL
    WHEN jsonb_typeof(val) = 'string' THEN trim(both '"' from val::text)
    WHEN jsonb_typeof(val) = 'array' AND jsonb_array_length(val) > 0 THEN
      trim(both '"' from (val->0)::text)
    ELSE val::text
  END;
$$;
```

If you prefer not to create a temp function, each query below uses inline `CASE` where needed.

---

### Q1 — Side-by-side counts & totals (FDW vs canonical)

```sql
SELECT 'grants_fdw' AS source, COUNT(*) AS row_count,
       COALESCE(SUM(sum_activity_amount), 0) AS sum_activity_amount,
       COALESCE(SUM(total_transferred_amount_usd), 0) AS sum_transferred
FROM public.grants
UNION ALL
SELECT 'grants_canonical', COUNT(*),
       COALESCE(SUM(sum_activity_amount), 0),
       COALESCE(SUM(total_transferred_amount_usd), 0)
FROM public.grants_grid_view
UNION ALL
SELECT 'decisions_fdw', COUNT(*), NULL, NULL
FROM public.distribution_decision
UNION ALL
SELECT 'decisions_canonical', COUNT(*), NULL, NULL
FROM public.distribution_decision_master_sheet_1
UNION ALL
SELECT 'allocations_fdw', COUNT(*),
       COALESCE(SUM(allocation_amount), 0), NULL
FROM public.allocations
UNION ALL
SELECT 'allocations_canonical', COUNT(*),
       COALESCE(SUM("Allocation Amount"), 0), NULL
FROM public.allocations_by_date;
```

---

### Q2 — Sample grants (FDW)

```sql
SELECT
  grant_id,
  project_name,
  status,
  grant_start_date,
  total_transferred_amount_usd,
  sum_activity_amount,
  jsonb_pretty(donor_name)   AS donor_name,
  jsonb_pretty(partner_name) AS partner_name
FROM public.grants
ORDER BY grant_start_date DESC NULLS LAST
LIMIT 5;
```

---

### Q3 — Sample distribution decisions (FDW)

```sql
SELECT
  id,
  decision_id,
  decision_id_proposed,
  jsonb_pretty(decision_id_proposed) AS decision_id_proposed_pretty,
  decision_date,
  decision_amount,
  sum_allocation_amount,
  restriction,
  jsonb_pretty(grant_name) AS grant_name
FROM public.distribution_decision
ORDER BY decision_date DESC NULLS LAST
LIMIT 5;
```

---

### Q4 — Sample allocations (FDW) + raw jsonb keys

```sql
SELECT
  allocation_id,
  jsonb_pretty(allocation_id) AS allocation_id_pretty,
  decision_id,
  jsonb_pretty(decision_id) AS decision_id_pretty,
  state,
  allocation_amount,
  percent_decision_amount,
  decision_date,
  jsonb_pretty(decision_date) AS decision_date_pretty,
  restriction,
  status,
  serial
FROM public.allocations
ORDER BY allocation_amount DESC NULLS LAST
LIMIT 10;
```

---

### Q5 — jsonb type survey (allocations)

```sql
SELECT
  jsonb_typeof(allocation_id) AS allocation_id_type,
  jsonb_typeof(decision_id)   AS decision_id_type,
  jsonb_typeof(grant_id)      AS grant_id_type,
  COUNT(*) AS n
FROM public.allocations
GROUP BY 1, 2, 3
ORDER BY n DESC;
```

---

### Q6 — Grants only in one system

```sql
-- In Airtable FDW but not canonical
SELECT g.grant_id, g.project_name, g.status
FROM public.grants g
WHERE NOT EXISTS (
  SELECT 1 FROM public.grants_grid_view c WHERE c.grant_id = g.grant_id
)
ORDER BY g.grant_id;

-- In canonical but not FDW
SELECT c.grant_id, c.project_name, c.status
FROM public.grants_grid_view c
WHERE NOT EXISTS (
  SELECT 1 FROM public.grants g WHERE g.grant_id = c.grant_id
)
ORDER BY c.grant_id;
```

---

### Q7 — Decisions & allocations only in one system

```sql
-- Decisions: FDW id (rec…) mapped to proposed id text
WITH fdw_decisions AS (
  SELECT
    id AS airtable_rec_id,
    decision_id,
    CASE
      WHEN jsonb_typeof(decision_id_proposed) = 'string'
        THEN trim(both '"' from decision_id_proposed::text)
      WHEN jsonb_typeof(decision_id_proposed) = 'array'
        THEN trim(both '"' from (decision_id_proposed->0)::text)
      ELSE decision_id_proposed::text
    END AS proposed_text
  FROM public.distribution_decision
),
canonical_decisions AS (
  SELECT decision_id_proposed, decision_id, id AS canonical_uuid
  FROM public.distribution_decision_master_sheet_1
)
SELECT 'fdw_only' AS side, d.airtable_rec_id, d.decision_id, d.proposed_text
FROM fdw_decisions d
WHERE NOT EXISTS (
  SELECT 1 FROM canonical_decisions c
  WHERE c.decision_id_proposed = d.proposed_text
     OR c.decision_id = d.decision_id
)
UNION ALL
SELECT 'canonical_only', NULL, c.decision_id, c.decision_id_proposed
FROM canonical_decisions c
WHERE NOT EXISTS (
  SELECT 1 FROM fdw_decisions d
  WHERE d.proposed_text = c.decision_id_proposed
     OR d.decision_id = c.decision_id
)
ORDER BY side, proposed_text;
```

```sql
-- Allocations: compare business Allocation_ID (canonical) vs FDW allocation_id text
WITH fdw_alloc AS (
  SELECT
    CASE
      WHEN jsonb_typeof(allocation_id) = 'string'
        THEN trim(both '"' from allocation_id::text)
      WHEN jsonb_typeof(allocation_id) = 'array'
        THEN trim(both '"' from (allocation_id->0)::text)
      ELSE allocation_id::text
    END AS alloc_key,
    state,
    allocation_amount,
    decision_id
  FROM public.allocations
)
SELECT 'fdw_only' AS side, f.alloc_key, f.state, f.allocation_amount
FROM fdw_alloc f
WHERE NOT EXISTS (
  SELECT 1 FROM public.allocations_by_date c
  WHERE c."Allocation_ID" = f.alloc_key
)
UNION ALL
SELECT 'canonical_only', c."Allocation_ID", c."State", c."Allocation Amount"
FROM public.allocations_by_date c
WHERE NOT EXISTS (
  SELECT 1 FROM fdw_alloc f WHERE f.alloc_key = c."Allocation_ID"
)
ORDER BY side, alloc_key
LIMIT 50;
```

> If Q7 allocation diff returns many rows, share the first 20 and total counts only.

---

## Q8 — Airtable API field reference

Source: [Airtable API docs](https://airtable.com/appq9qjlnEW7d0tqZ/api/docs) (base `appq9qjlnEW7d0tqZ`). Prefer **field ids** in push requests.

### Grants (`tbla1FnD7fNMY2q77`)

| Airtable field | Field ID | Type | Portal / FDW map | Push? |
|----------------|----------|------|------------------|-------|
| `Grant_ID` | `fldLyqNpJtzcW6aKl` | Long text | `grants_grid_view.grant_id` / FDW `grant_id` | **Yes** — natural key; lookup via `filterByFormula` for `airtable_record_id` |
| `Project_Name` | `fld9daZr5W8N4nNpB` | Text | `project_name` | **Yes** |
| `Donor_name` | `flde36wkAuNDrEW8J` | Link → Donors | FDW jsonb `["rec…"]`; canonical `donor_name` text + `donor_id` uuid | **Yes** — send array of Donor `rec…` ids (resolve from `public.donors` ↔ Airtable Donors) |
| `Partner_name` | `fldgbPEm17Z2YHSco` | Link → Partners | FDW jsonb `["rec…"]`; canonical `partner_name` text | **Yes** — array of Partner `rec…` ids |
| `Grant_start_date` | `fldn19UjUJkoWAVND` | Date (ISO) | `grant_start_date` | **Yes** |
| `Grant_end_date` | `fld8oSgjyKPfhPESN` | Date (ISO) | `grant_end_date` | **Yes** |
| `Status` | `fldPmFjGc4gNfBNqH` | Single select | `status` — values `Active` \| `Complete` (capital A/C) | **Yes** — exact match or `typecast: true` |
| `Project_ID` | `fldL5mHiEhZO8TlIW` | Long text | `project_id` | **Yes** (if used) |
| `Total_transferred_amount_USD` | `fldJYbSkCnjuF7qV4` | **Formula** | FDW `total_transferred_amount_usd` | **No** — computed |
| `Sum_Activity_Amount` | `fld6fXnsXhV17U0bO` | **Rollup** | FDW `sum_activity_amount` | **No** — computed from Transfer_Segment |
| `Sum_Transfer_Fee_Amount` | `fldTLEK0mgyrrJeUt` | **Rollup** | FDW `sum_transfer_fee_amount` | **No** — computed |
| `Transfer_Segment` | `fldT09OiowWBhpmrg` | Link → Transfer_Segment | FDW `transfer_segment` jsonb | **No** for grant-mgmt v1 (managed elsewhere) |
| `Activities` | `fldLIm3KQ5z323aff` | Link → Activities | `grants_grid_view.activities` | **No** for grant-mgmt v1 |

**Record id:** Airtable `rec…` (e.g. `recrGwIFmb0lojsUb`) — **not on FDW row**; store in `grants_grid_view.airtable_record_id` via API list/find filtered on `Grant_ID`.

**Push payload (create/update):** `Grant_ID`, `Project_Name`, `Donor_name`, `Partner_name`, `Grant_start_date`, `Grant_end_date`, `Status`, optionally `Project_ID`.

**FDW ↔ API naming:** FDW uses snake_case (`grant_id`); API uses PascalCase with underscores (`Grant_ID`, `Project_Name`).

### Distribution_Decision (`tblsdYJyH7SUTwVkm`)

| Airtable field | Field ID | Type | Portal / FDW map | Push? |
|----------------|----------|------|------------------|-------|
| `decision_id_proposed` | `fldEnnOCO3qSfckOI` | **Formula** | FDW jsonb string; canonical `decision_id_proposed` | **No** — computed: `"LCC."&Partner&"."&DATETIME_FORMAT(Decision_Date,'YYYY-MM-DD')&"."&LEFT(Restriction,4)` |
| `Partner` | `fld7AFruocQ4OaImD` | Link → Partners | FDW `partner` jsonb; canonical `partner` text | **Yes** — array of Partner `rec…` ids; drives formula |
| `Grant_Name` | `fldOz3DDjTT9OC9OR` | Multiple select | FDW `grant_name` jsonb (often null) | **Optional** — values e.g. `P2H`, `DKH`, `FCDO`, `Malala Fund` |
| `Decision_Amount` | `fldXD9Y0zimXCJkl7` | Currency | `decision_amount` | **Yes** |
| `Sum_Allocation_Amount` | `fldBO3eHUV0SZvTOP` | **Rollup** | `sum_allocation_amount` | **No** — SUM of linked Allocations |
| `Variance` | `fldxiOaxkt5tPQVPB` | **Formula** | FDW `variance` | **No** |
| `Decision_Date` | `fld0qpZ9A8pXuWu1X` | Date (ISO) | `decision_date` | **Yes** — drives formula |
| `File Name` | `fldzJVIWR35nJGmaS` | Text | `file_name` | **Yes** |
| `File Link` | `fld3RxSGrNTh7nqhy` | URL | `file_link` | **Yes** |
| `Fund_Request` | `fldUKOCqcnt6e6RcC` | Link → Fund_Request | FDW `fund_request` jsonb | **No** for grant-mgmt v1 |
| `Transfer_Segment` | `fldIpHvXVhZjoO8MG` | Link → Transfer_Segment | FDW `transfer_segment` jsonb | **No** for grant-mgmt v1 |
| `Allocation_ID` | `fldur2TcATQxyqcOd` | Link → Allocations | FDW `allocation_id` jsonb | **No** — reverse link; populated when allocations link back |
| `Notes` | `fldcsSjWC78B6l8Jm` | Long text | `notes` | **Yes** |
| `Restriction` | `fldccEA5UUX5jUcNw` | Single select | `restriction` | **Yes** — `Flexible`, `Protection`, `Capacity Building`, `WRR`, `Emergency`, `CHAD`; formula uses first 4 chars |
| `Field 16` | `fldEDNVGRR1vaNDmx` | Text | — | **No** unless needed |

**Record id:** Airtable `rec…` — FDW column `distribution_decision.id` (e.g. `recxnYC1Zo9rc2t1y`) → `airtable_record_id`.

**FDW `decision_id`:** Text column on FDW; **not listed as separate writable field** in API docs — may be legacy/unused. Recent rows have `decision_id` null; identifier is `decision_id_proposed` (formula output).

**Push payload (create):** `Partner`, `Decision_Date`, `Decision_Amount`, `Restriction`, optionally `Grant_Name`, `Notes`, `File Name`, `File Link`. Do **not** send `decision_id_proposed`, `Sum_Allocation_Amount`, or `Variance`.

**Portal create UX implication:** User may still type `decision_id_proposed` in portal (canonical storage). On Airtable push, **parse or derive** `Partner` + `Decision_Date` + `Restriction` from that string (pattern `LCC.{Partner}.{YYYY-MM-DD}.{Rest}`) OR change UI to collect those fields separately and generate proposed id in portal to match formula.

**`#ERROR!` rows:** Formula fails when `Partner`, `Decision_Date`, or `Restriction` is missing/invalid — matches Q7 `recxnYC1Zo9rc2t1y` and `recKhnE6o5ktuEteU`. Fix in Airtable before cutover.

**Allocation link:** Allocations table links **to** this decision via `Decision_ID`; do not push `Allocation_ID` on decision create.

### Allocations (`tblsNejy5kmkflLoN`)

| Airtable field | Field ID | Type | Portal / FDW map | Push? |
|----------------|----------|------|------------------|-------|
| `Allocation_ID` | `fldaT7KENiULZxzXq` | **Formula** | FDW jsonb string; canonical `"Allocation_ID"` | **No** — computed: `"LCC.AD."&Partner&"."&DATETIME_FORMAT({Decision_Date},'YY-MM-DD')&"."&Serial` |
| `Decision_ID` | `fldBUuQbpMOFyWtmE` | Link → Distribution_Decision | FDW `decision_id` jsonb `["rec…"]` | **Yes** — array with one decision `rec…` id |
| `Allocation_Amount` | `fldNlQK9Y2ErKvYI9` | Number (2 dp) | `"Allocation Amount"` | **Yes** |
| `State` | `fldKvIJYjR1jis7EE` | Single select | `State` | **Yes** — must match Airtable options exactly (includes `Sennar` and `Sinar`, `Gadarif`, some with trailing spaces) |
| `Serial` | `fldyDukcJ2VgqtP1N` | **Auto Number** | FDW `serial` | **No** — assigned by Airtable; drives `Allocation_ID` formula |
| `Decision_Date` | `fldz370SNSYyGbJIR` | **Lookup** | FDW `decision_date` jsonb | **No** — from linked decision |
| `Decision_Amount` | `fldKTwd6jZJBJ7tIU` | **Lookup** | — | **No** |
| `Partner` | `fld53uCIT24aH6K0b` | **Lookup** | FDW `partner` jsonb | **No** — from linked decision |
| `%_Decision_Amount` | `fldeAPuDXErKJ44li` | **Formula** | `%_Decision_Amount` | **No** |
| `Decision Maker` | `fld61oJwRmRlhrxCD` | Single select | `Decision Maker` | Optional — `LCC`, `Partner`, `Restricted` |
| `Restriction` | `fld0MrOG2Tz5RTIL9` | Single select | `Restriction` | Optional — note: no `CHAD` (unlike decisions table) |
| `Notes` | `fldmpfhyVzSF3hiW8` | Single select | `Notes` | Optional (Airtable type is select, not long text) |
| `Status` | `fldG96up9gRxl65cI` | Single select | `Status` | Optional |
| `Flow Oversight` | `fldYm85KUUAlOsERb` | Single select | `Flow Oversight` | Optional |
| `Sequence` | `fld8jDpKSkHKm70Fo` | Text | `sequence` | Optional |

**Record id:** Airtable `rec…` (e.g. `recs50T0blmYhRYlh`) — **not** the same as `Allocation_ID` string. Store in `airtable_record_id`; resolve via API `find(rec…)` or list + match on formula field after create.

**Push payload (create):** `Decision_ID` (decision `rec…`), `Allocation_Amount`, `State`, optionally `Restriction`, `Status`, `Decision Maker`, `Flow Oversight`. Do **not** send `Allocation_ID`, `Serial`, lookups, or `%_Decision_Amount`.

**After create:** Read back `Allocation_ID` (formula) and `Serial` from Airtable response → update canonical row (replace portal-generated id if different).

**`#ERROR!` allocation:** `Allocation_ID` formula failed (same root cause as broken decisions) — the $485k North Darfur row.

**Excel upload (portal-only):** User uploads in Portal → parse template → write **canonical tables first** → async/sync push to Airtable. Portal assigns stable keys (`decision_id_proposed`, `Allocation_ID` or portal row id); Airtable mirror is downstream.

**Legacy note:** Old code used `crypto.randomUUID()` for `Allocation_ID` — replace with portal-generated business keys (matching existing `LCC.AD…` pattern) or a dedicated `portal_allocation_id` column; do not depend on Airtable formula output for canonical identity.

**State normalization:** Map portal/FDW `Sinar` → Airtable `Sennar` where needed; watch trailing spaces on options (`Blue Nile `, `South Darfur `).

---

### Q8 — push targets (updated)

Portal pushes **raw tables only**. Automations update **existing writable fields** on display tables; formulas and rollups stay unchanged.

See **Airtable architecture (decided)** above. Q8 field reference for `Grants` / `Distribution_Decision` / `Allocations` documents display-table shapes; raw tables use plain equivalents of canonical columns.
