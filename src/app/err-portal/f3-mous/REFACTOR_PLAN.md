# F3 MOUs Page — Refactor Plan

**Target:** `src/app/err-portal/f3-mous/page.tsx` (~3,804 lines)  
**Goal:** Split into smaller, maintainable modules **without changing behavior**.  
**Phase 2 (separate):** Data-loading performance improvements after the structural refactor is stable.

---

## 1. Current State

### 1.1 Size breakdown (approximate)

| Section | Lines | % of file |
|---------|------:|----------:|
| Types + helpers (top of file) | ~110 | 3% |
| State + data functions | ~870 | 23% |
| Main table + filters + pagination | ~360 | 9% |
| MOU preview dialog (view/edit/PDF) | ~1,105 | 29% |
| List projects dialog | ~250 | 7% |
| Assign grant dialog | ~315 | 8% |
| Reassign grant dialog | ~305 | 8% |
| Payment confirmation dialog | ~350 | 9% |
| `PoolByDonor` + layout shell | ~50 | 1% |

Already extracted:

- `components/HierarchicalBudgetTable.tsx`
- `components/MoUsNeedingPaymentAlert.tsx`
- `F3MousPageExplainer.tsx`

### 1.2 State inventory (~50 `useState` values)

All state currently lives in `F3MOUsPage`, grouped by feature:

**List / table**

- `mous`, `loading`, `mousFilters`, `currentPage`, `sortCreatedOrder`
- `mouGrantIds`, `mouProjectCounts`, `mouPaymentProjectCounts`, `mouAssignmentStatus`

**MOU preview**

- `previewOpen`, `activeMou`, `detail`, `translations`
- `exporting`, `forceBudgetExpanded`, `editMode`, `editingMou`, `saving`

**Grant assign / reassign (shared)**

- `assignModalOpen`, `assigningMouId`, `reassignModalOpen`, `reassigningMouId`
- `tempGrantId`, `tempDonorName`, `tempMMYY`, `grantsFromGridView`
- `mouProjects`, `stateShorts`, `donorShortNames`, `selectedGrantMaxSequence`
- `grantRemaining`, `stateAllocationRemaining`, `mouTotalAmount`
- `isAssigning`, `isReassigning`

**List projects**

- `listProjectsModalOpen`, `listProjectsMouId`, `listProjectsMouCode`, `listProjectsList`
- `listProjectsLoading`, `listProjectsMouAssigned`, `listProjectsAddMode`
- `candidatesForAdd`, `selectedCandidates`, `listProjectsActionLoading`

**Payment**

- `paymentModalOpen`, `selectedMouForPayment`, `paymentProjects`
- `paymentConfirmations`, `uploadingPayments`, `uploadingAllPayments`
- `bulkPaymentExchangeRate`, `bulkPaymentTransferDate`

**Misc**

- `currentUser` (fetched on mount; used for role-gated UI)

### 1.3 Cross-cutting dependencies

Functions used from multiple features:

| Function | Used by |
|----------|---------|
| `fetchMous()` | Mount, assign, reassign, list projects, payment, preview save, signed MOU upload |
| `checkMouAssignmentStatus()` | `fetchMous`, list projects add/remove |
| `sumExpensesUsd()`, `getCategoriesFromPlannedActivities()` | List projects, table helpers |
| `getPaymentConfirmationCount()` | Table row, payment alert (`useMemo`) |
| `parsePaymentConfirmations()` | Payment modal open + upload refresh |

### 1.4 External integrations (must not break)

- **API routes:** `/api/f3/mous`, `/api/f3/mous/[id]`, assign/reassign, projects add/remove, regenerate, payment-confirmation, signed-mou; `/api/f2/committed`; `/api/pool/grant-remaining`, `/api/pool/state-allocation-remaining`; `/api/translate`; `/api/storage/signed-url`; `/api/users/me`
- **Supabase client:** Direct browser queries in `fetchMous`, assignment status, modal open handlers
- **Permissions:** `useAllowedFunctions` — `f3_view_page`, `f3_edit_mou`, `f3_assign`, `f3_reassign_grant`, `f3_view_mou`, `f3_manage_projects`, `f3_manage_payment`, `f3_upload_signed_mou`
- **i18n:** `f3` and `common` namespaces; RTL on table
- **PDF export:** Dynamic `html2canvas` + `jspdf` imports; depends on DOM `id="mou-preview-content"` and `data-mou-section` / `data-mou-subsection` attributes
- **SmartFilter:** URL param prefix `f3m_`
- **Page explainer:** `useF3MousPageExplainer`

---

## 2. Refactor Principles

1. **Behavior-preserving moves only** — no logic changes, no API changes, no UI copy changes in phase 1.
2. **Incremental extraction** — one module per PR/commit; verify manually after each step.
3. **Colocate state with the feature that owns it** — reduce parent re-renders as a side benefit, but not the primary acceptance criterion.
4. **Keep `page.tsx` as orchestrator** — permissions gate, layout shell, wiring callbacks.
5. **Defer performance work** — N+1 queries, lazy loading, API consolidation belong in phase 2 (section 7).
6. **Do not consolidate assign/reassign UI until both are extracted and tested separately** — they are ~95% identical but have subtle filter differences (approved vs assigned projects).

---

## 3. Target File Structure

```
f3-mous/
  page.tsx                          # Thin shell (~150–250 lines)
  REFACTOR_PLAN.md                  # This file
  F3MousPageExplainer.tsx           # (existing)
  types.ts                          # MOU, MOUDetail, Signature, row types
  lib/
    payment-confirmations.ts        # parse/format/count helpers
    project-helpers.ts              # sumExpensesUsd, getCategoriesFromPlannedActivities, fmtUsd
    mou-preview-helpers.ts            # splitApprovedAccountBlocks, toDisplay, signature init logic
  hooks/
    useF3MousList.ts                # List fetch, filters, sort, pagination, derived alert data
    useMouPreview.ts                # Preview open, detail, translations, edit, save, PDF
    useGrantAssignment.ts           # Shared assign + reassign state & handlers
    useListProjectsModal.ts         # List/add/remove projects flow
    usePaymentModal.ts              # Payment confirmation flow
  components/
    HierarchicalBudgetTable.tsx     # (existing)
    MoUsNeedingPaymentAlert.tsx       # (existing)
    MousTable.tsx                   # SmartFilter + table + pagination
    MousTableRow.tsx                # Single row actions (optional sub-split)
    MouPreviewDialog.tsx            # Preview / edit / PDF (~1,100 lines)
    ListProjectsDialog.tsx
    GrantAssignmentDialog.tsx       # mode: 'assign' | 'reassign' (phase 1b, after separate extraction)
    PaymentConfirmationDialog.tsx
```

---

## 4. Module Specifications

### 4.1 `types.ts`

Move interfaces from `page.tsx`:

- `Signature`
- `MOU`
- `MOUDetail`
- `MouProjectRow` (list projects table shape)
- `PaymentProjectRow`
- `GrantRemaining`, `StateAllocationRemaining`
- `MouAssignmentStatus`

Export types only; no runtime code.

### 4.2 `lib/payment-confirmations.ts`

Pure functions (copy verbatim):

- `parsePaymentConfirmations`
- `formatPaymentConfirmations`
- `getPaymentConfirmationCount`

### 4.3 `lib/project-helpers.ts`

Pure functions:

- `sumExpensesUsd`
- `getCategoriesFromPlannedActivities`
- `fmtUsd`
- `toDisplay` (currently inline in page)

### 4.4 `lib/mou-preview-helpers.ts`

Extract from preview dialog:

- `splitApprovedAccountBlocks`
- `buildInitialSignaturesForEdit()` — the long signature pre-population block in the Edit button handler (~lines 2145–2220)
- `hasArabic()` — used by translation logic

Keep `aggregatedData` computation either in `useMouPreview` or a small `useMouAggregatedData(detail)` hook using existing `@/lib/mou-aggregation` imports.

### 4.5 `hooks/useF3MousList.ts`

**Owns:** list loading, filters, sort, pagination, grant IDs, project counts, assignment status.

**Returns:**

```ts
{
  mous, loading,
  mousFilters, setMousFilters,
  filteredMous, sortedMous, paginatedMous,
  currentPage, setCurrentPage, sortCreatedOrder, setSortCreatedOrder,
  mouGrantIds, mouProjectCounts, mouPaymentProjectCounts, mouAssignmentStatus,
  moUsNeedingPayment,
  mouFilterFields,
  fetchMous,          // exposed for child refresh callbacks
  checkMouAssignmentStatus,
}
```

**Moves verbatim:**

- `fetchMous`, `checkMouAssignmentStatus`
- Filter/sort/pagination `useMemo` / `useCallback` blocks (lines ~1020–1098)
- Mount `useEffect` that calls `fetchMous()` only (grants fetch moves to assignment hook)

**Does not own:** modal state, preview state.

### 4.6 `hooks/useGrantAssignment.ts`

**Owns:** assign + reassign modals and all shared form state.

**Moves verbatim:**

- `fetchGrantsFromGridView` (+ mount call when first modal opens, or keep eager fetch to preserve behavior)
- `openAssignModal`, `openReassignModal`, `handleAssignMou`, `handleReassignMou`
- `calculateGrantRemaining`, `calculateStateAllocationRemaining`
- Related `useEffect`s (lines ~1000–1018)

**Returns:**

```ts
{
  // assign
  assignModalOpen, setAssignModalOpen, assigningMouId, openAssignModal, handleAssignMou, isAssigning,
  // reassign
  reassignModalOpen, setReassignModalOpen, reassigningMouId, openReassignModal, handleReassignMou, isReassigning,
  // shared form
  tempGrantId, setTempGrantId, tempDonorName, tempMMYY, setTempMMYY,
  grantsFromGridView, mouProjects, stateShorts, donorShortNames, selectedGrantMaxSequence,
  grantRemaining, stateAllocationRemaining, mouTotalAmount,
  mouAssignmentStatus, // read-only from list hook, passed in
  mous,                // read-only, for mou_code lookup
  onAssignmentComplete: fetchMous, // callback
}
```

**Note:** Assign and reassign dialogs can remain two JSX files initially (`AssignGrantDialog.tsx`, `ReassignGrantDialog.tsx`) that both consume this hook, or receive props from the parent. Consolidate into `GrantAssignmentDialog` only after parity testing.

### 4.7 `hooks/useMouPreview.ts`

**Owns:** preview modal lifecycle.

**Moves:**

- `previewOpen`, `activeMou`, `detail`, `translations`, `editMode`, `editingMou`, `saving`, `exporting`, `forceBudgetExpanded`
- `openPreview(mou)` — extract inline table click handler (fetch detail + translate)
- Save handler (`PATCH /api/f3/mous/[id]`)
- PDF export handler (keep dynamic imports inside)

**Props/callbacks:**

- `canEditMou`, `fetchMous`, `previewId = 'mou-preview-content'`

**Important:** On close, preserve current behavior (today `activeMou` is **not** cleared). Document this; phase 2 may clear it for performance.

### 4.8 `hooks/useListProjectsModal.ts`

**Owns:** list projects modal state and mutations.

**Moves:**

- `openListProjectsModal`, add/remove project handlers, candidates fetch
- All `listProjects*` state

**Callbacks:** `fetchMous`, `checkMouAssignmentStatus`

### 4.9 `hooks/usePaymentModal.ts`

**Owns:** payment modal state and upload logic.

**Moves:**

- `openPaymentModal`, `applyBulkPaymentToAllProjects`
- Per-project and bulk upload handlers
- All `payment*` / `bulkPayment*` state

**Callbacks:** `fetchMous`, `t` for i18n alerts

### 4.10 `components/MousTable.tsx`

**Props:**

```ts
{
  loading, sortedMous, paginatedMous, totalCount,
  mouGrantIds, mouProjectCounts, mouPaymentProjectCounts, mouAssignmentStatus,
  mouFilterFields, mousFilters, onFiltersChange,
  sortCreatedOrder, onSortCreatedOrderChange,
  currentPage, onPageChange, itemsPerPage,
  permissions: { canAssign, canReassignGrant, canViewMou, canManageProjects, canManagePayment, canUploadSignedMou },
  onOpenListProjects, onOpenAssign, onOpenReassign, onOpenPreview, onOpenPayment,
  onSignedMouUpload, onSignedMouView,
  onRefresh: fetchMous,
}
```

**Contains:** Card, SmartFilter, Table, pagination controls.

**Optional sub-component:** `MousTableRow.tsx` if row actions remain verbose (~270 lines per row block).

### 4.11 `components/MouPreviewDialog.tsx`

Largest extraction (~1,100 lines). Receives state + handlers from `useMouPreview`.

**Sub-sections (optional inner components, same PR or follow-up):**

- `MouPreviewSectionObjectives` (bilingual objectives/beneficiaries/activities)
- `MouPreviewSectionContacts` (contact + signatures view/edit)
- `MouPreviewToolbar` (Close, Edit, Save, Download PDF)

**Critical invariants:**

- Root preview div keeps `id={previewId}`
- Sections keep `data-mou-section` and `data-mou-subsection` for PDF chunking
- `HierarchicalBudgetTable` `forceExpanded={forceBudgetExpanded}` unchanged

### 4.12 `components/ListProjectsDialog.tsx`

Self-contained dialog; props from `useListProjectsModal`.

### 4.13 `components/AssignGrantDialog.tsx` + `ReassignGrantDialog.tsx`

Initially duplicate JSX from lines 2830–3143 and 3146–3448. Wire to `useGrantAssignment`.

Later (optional): merge into `GrantAssignmentDialog` with `mode` prop and title/color differences.

### 4.14 `components/PaymentConfirmationDialog.tsx`

Props from `usePaymentModal`; preserve backward-compatible payment JSON parsing.

### 4.15 Slim `page.tsx`

Final shape:

```tsx
export default function F3MOUsPage() {
  const { can, isLoading: permissionsLoading } = useAllowedFunctions()
  const list = useF3MousList()
  const preview = useMouPreview({ fetchMous: list.fetchMous, canEditMou: can('f3_edit_mou') })
  const assignment = useGrantAssignment({ fetchMous: list.fetchMous, mous: list.mous, mouAssignmentStatus: list.mouAssignmentStatus })
  const listProjects = useListProjectsModal({ fetchMous: list.fetchMous, checkMouAssignmentStatus: list.checkMouAssignmentStatus })
  const payment = usePaymentModal({ fetchMous: list.fetchMous })

  // permission redirect (existing useEffect)
  useF3MousPageExplainer(...)

  if (!can('f3_view_page')) return null

  return (
    <div className="max-w-[1600px] ...">
      {can('f3_manage_payment') && <MoUsNeedingPaymentAlert ... />}
      <MousTable ... />
      <PoolByDonor />
      <MouPreviewDialog ... />
      <ListProjectsDialog ... />
      <AssignGrantDialog ... />
      <ReassignGrantDialog ... />
      <PaymentConfirmationDialog ... />
    </div>
  )
}
```

---

## 5. Implementation Phases (ordered for safety)

### Phase 0 — Baseline

- [ ] Manually smoke-test all flows on `localhost:3001/err-portal/f3-mous` and note current behavior
- [ ] Capture network waterfall on cold load (request count baseline for phase 2)

### Phase 1 — Pure extraction (no React structure change)

| Step | Action | Risk |
|------|--------|------|
| 1.1 | Create `types.ts`, update imports in `page.tsx` | Very low |
| 1.2 | Create `lib/payment-confirmations.ts` | Very low |
| 1.3 | Create `lib/project-helpers.ts` | Very low |
| 1.4 | Create `lib/mou-preview-helpers.ts` (start with `splitApprovedAccountBlocks` only) | Low |

Verify: `npm run build` + quick smoke test.

### Phase 2 — Hook extraction (page still renders all JSX)

| Step | Action | Risk |
|------|--------|------|
| 2.1 | `useF3MousList` — move fetch + filter logic; page calls hook | Low |
| 2.2 | `usePaymentModal` | Low |
| 2.3 | `useListProjectsModal` | Medium |
| 2.4 | `useGrantAssignment` | Medium |
| 2.5 | `useMouPreview` | Medium |

Verify after each hook: list load, filters, pagination, one action per modal.

### Phase 3 — Component extraction

| Step | Action | Lines removed from page |
|------|--------|------------------------|
| 3.1 | `PaymentConfirmationDialog` | ~350 |
| 3.2 | `ListProjectsDialog` | ~250 |
| 3.3 | `AssignGrantDialog` + `ReassignGrantDialog` | ~620 |
| 3.4 | `MousTable` (+ optional `MousTableRow`) | ~360 |
| 3.5 | `MouPreviewDialog` | ~1,100 |

Verify after each: full regression checklist (section 6).

### Phase 4 — Cleanup

- [ ] Remove unused `dynamic` import from `page.tsx` (or use it for lazy dialog loading in phase 2 perf)
- [ ] Remove dead code / duplicate helpers
- [ ] Ensure no circular imports (`hooks` → `types` / `lib` only; `components` → `hooks` / `types` / `lib`)
- [ ] Target `page.tsx` under 250 lines

### Phase 5 — Optional consolidation (only if phase 3 is stable)

- [ ] Merge assign + reassign into `GrantAssignmentDialog`
- [ ] Split `MouPreviewDialog` into section sub-components
- [ ] Extract `MousTableRow`

---

## 6. Regression Test Checklist

Run after each phase 3 step:

**List**

- [ ] Page loads MOUs; loading spinner shows then table
- [ ] SmartFilter (state, grant ID, unassigned) works; URL params `f3m_*` persist
- [ ] Sort by created date toggles asc/desc; pagination works

**Preview**

- [ ] Open preview — detail loads, bilingual content renders
- [ ] Auto-translation runs for objectives/beneficiaries/activities
- [ ] Edit mode: banking, contacts, dates, signatures — save succeeds
- [ ] Download PDF opens new tab with correct sections
- [ ] Close preview

**List projects**

- [ ] Open list for unassigned MOU — add/remove projects, regenerate
- [ ] Open list for assigned MOU — read-only view

**Assign / reassign**

- [ ] Assign: grant select loads remaining amounts, serial preview, submit
- [ ] Reassign: only assigned projects; submit
- [ ] Table refreshes; assign/reassign buttons update

**Payment**

- [ ] Payment icon states: none / partial / complete
- [ ] Payment alert banner opens correct MOU
- [ ] Single + bulk upload; exchange rate + transfer date validation
- [ ] Old single-file payment format still works

**Signed MOU**

- [ ] Upload PDF; view existing signed MOU

**Permissions**

- [ ] User without `f3_view_page` redirected to `/err-portal`
- [ ] Action buttons hidden when permissions missing

**Other**

- [ ] `PoolByDonor` section still renders
- [ ] Page explainer content unchanged
- [ ] Arabic RTL layout on table

---

## 7. Phase 2 — Data Performance (after refactor)

Do **not** mix with structural refactor. Address once modules are stable.

### 7.1 High impact

| Issue | Location | Proposed fix |
|-------|----------|--------------|
| N+1 assignment status queries | `checkMouAssignmentStatus` | Single query: `select mou_id, grant_id from err_projects where mou_id in (...)` then aggregate in JS |
| Redundant client Supabase calls after list API | `fetchMous` | Extend `GET /api/f3/mous` to return `grant_id`, `project_count`, `payment_project_count`, `assignment_status` per MOU |
| Eager grants grid fetch | mount `useEffect` | Fetch `grantsFromGridView` only when assign/reassign modal opens |

### 7.2 Medium impact

| Issue | Proposed fix |
|-------|--------------|
| Multiple `setState` on load causing re-renders | Return single payload from API; one `setMousListMeta` or use `useReducer` in `useF3MousList` |
| Preview `activeMou` retained after close | Clear `activeMou`/`detail` on dialog close (behavior-visible only if user reopens quickly — verify) |
| All dialogs in parent render tree | `dynamic(() => import('./components/MouPreviewDialog'), { ssr: false })` etc. |
| State shorts N+1 in `openReassignModal` | Batch `states` query with `.in('state_name', uniqueStates)` (assign modal already does this) |

### 7.3 Lower priority

- React Query / SWR for list caching and background refresh
- Server Components for initial list shell (larger architectural change)

### 7.4 Suggested API shape (phase 2)

```ts
// GET /api/f3/mous — extended response per item
{
  ...mou,
  grant_id: string | null,
  project_count: number,
  payment_project_count: number,
  has_unassigned: boolean,
  has_assigned: boolean,
}
```

---

## 8. Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Subtle behavior change when moving handlers | Copy-paste first; refactor logic only in phase 2 perf |
| PDF export breaks after DOM move | Keep `id` and `data-mou-*` attributes identical; test PDF after `MouPreviewDialog` extraction |
| Shared assign/reassign state conflated | Keep one `useGrantAssignment` hook; two dialog components until consolidated |
| Circular imports | `lib/` and `types/` have no component imports; hooks import lib only |
| Translation race on fast preview open/close | Preserve existing async flow; no abort logic added in phase 1 |
| Payment backward compatibility | Keep `parsePaymentConfirmations` verbatim in `lib/` |

---

## 9. Success Criteria

**Phase 1 (refactor) complete when:**

- `page.tsx` is under 250 lines
- All items in section 6 pass
- No change to API contracts or user-visible behavior
- Build and lint pass

**Phase 2 (perf) complete when:**

- Initial load request count reduced (target: eliminate N+1 assignment loop)
- Measurable improvement in time-to-interactive on cold load
- No regression in section 6

---

## 10. Recommended PR Strategy

Split into reviewable PRs:

1. `refactor(f3-mous): extract types and lib helpers`
2. `refactor(f3-mous): extract useF3MousList hook`
3. `refactor(f3-mous): extract payment and list projects hooks + dialogs`
4. `refactor(f3-mous): extract grant assignment hooks + dialogs`
5. `refactor(f3-mous): extract MousTable and MouPreviewDialog`
6. *(later)* `perf(f3-mous): consolidate list API and fix N+1 queries`

Each PR should be independently deployable with full regression on section 6.
