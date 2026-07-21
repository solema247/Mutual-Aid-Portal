# F3 MOUs — Performance Plan

**Problem:** The F3 MOUs page feels slow on load (~5–10+ seconds with many MOUs).

**Root cause:** After `/api/f3/mous` returns (~800ms), the client runs **one Supabase query per MOU** (N+1) to decide Assign/Reassign buttons, plus three more query groups for project counts and grant IDs. The table spinner stays up until all of that finishes.

---

## Goal

Same UI and behaviour, much faster initial load.

---

## Approach

### Phase 1 — Server-side enrichment (implemented)

Move all project-derived fields into `GET /api/f3/mous`:

| Field | Use |
|-------|-----|
| `assignmentStatus` | Assign / Reassign buttons per row |
| `grantIds` | Grant ID column and filter |
| `projectCounts` | Committed approved/completed project count |
| `paymentProjectCounts` | Payment confirmation progress |

The API already fetches `err_projects` for expense totals. Extend that **single query** to also select `grant_id`, `grant_grid_id`, `funding_status`, `status`, then aggregate in JS. One extra query to `grants_grid_view` when needed.

**Response shape:**

```json
{
  "mous": [ /* MOU rows */ ],
  "grantIds": { "mou-uuid": "LCC-..." },
  "projectCounts": { "mou-uuid": 3 },
  "paymentProjectCounts": { "mou-uuid": 4 },
  "assignmentStatus": {
    "mou-uuid": { "hasUnassigned": true, "hasAssigned": false, "projectCount": 4 }
  }
}
```

Legacy consumers that expect a bare array still work via a small `parseMousListResponse()` helper.

### Phase 2 — Client simplification (implemented)

- `useF3MousList` removes all on-load Supabase calls.
- `fetchMous()` parses the enriched API response and sets state in one pass.
- Remove redundant `checkMouAssignmentStatus` after `fetchMous()` in list-projects modal.
- Remove duplicate `/api/users/me` fetch from the list hook (permissions hook already loads it).

---

## Expected impact

| Before | After |
|--------|-------|
| 1 API + N sequential client queries + 3 query groups | 1 API (2–3 server queries total) |
| Spinner until everything finishes | Spinner until one API returns |
| ~5–10s with 50 MOUs | ~1–2s typical |

---

## Out of scope (future)

- Slim list API payload (`select` only columns the table needs).
- Lazy-load dialog components.
- Defer `PoolByDonor` until expanded.
- Dedicated lightweight list endpoint if MOU count grows very large.

---

## Verification

- [ ] F3 MOUs table loads in ~1–2s (not 5–10s).
- [ ] Assign button appears only when projects lack `LCC-` grant.
- [ ] Reassign button appears when projects have `LCC-` grant.
- [ ] Grant ID column and filter work.
- [ ] Payment alert counts correct.
- [ ] Add/remove projects refreshes buttons and counts.
- [ ] Payment confirmation upload still refreshes MOU data.
