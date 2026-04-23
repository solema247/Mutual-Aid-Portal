# Phase 0 — `err_projects` inventory (`f1-work-plans`)

Scope: [`src/app/err-portal/f1-work-plans/`](../src/app/err-portal/f1-work-plans/).  
Purpose: single checklist for securing client-side Supabase writes (tampering / mass assignment).

**Related plan:** Cursor **Plans** → `err_projects_f1_security_3b8a408c.plan.md` (path is under your Cursor config, not necessarily this repo).

## Status

| Milestone | State |
|-----------|--------|
| Phase 0 — This inventory | **Done** |
| Phase 1 — FK `grant_segment` → `grant_segments(code)` | **Done** (constraint `err_projects_grant_segment_fkey`) |
| Phase 2 — Validated API for F1 **inserts** | **Done** — `POST /api/f1/workplan` |
| Phase 3 — ERR **mutations** (updates, feedback, move to F2) | **Done** — `POST /api/f1/err/*` + [`routeHandlerAuth`](../src/lib/routeHandlerAuth.ts) |
| Phase 4 — RLS | **Next** (see plan) |
| Phase 5 — XSS audit | Not started |

## Summary

| File | Operations | Notes |
|------|------------|--------|
| [ManualEntry/submitManualEntry.ts](../src/app/err-portal/f1-work-plans/components/ManualEntry/submitManualEntry.ts) | **POST** `/api/f1/workplan` | Insert body validated server-side; no direct `err_projects.insert` |
| [DirectUpload/index.tsx](../src/app/err-portal/f1-work-plans/components/DirectUpload/index.tsx) | **POST** `/api/f1/workplan` | Explicit payload after OCR/review |
| [ExtractedDataReview.tsx](../src/app/err-portal/f1-work-plans/components/DirectUpload/ExtractedDataReview.tsx) | **SELECT** only | Pool / cycle math |
| [ERRAppSubmissions/index.tsx](../src/app/err-portal/f1-work-plans/components/ERRAppSubmissions/index.tsx) | **SELECT** + **POST** `/api/f1/err/*` | Writes no longer use client `supabase.update`/`insert` on `err_projects` / `grant_workplan_seq` / `project_feedback` for those flows |

---

## ERR API routes (Phase 3)

| Endpoint | Maps to former client logic |
|----------|-----------------------------|
| `POST /api/f1/err/create-serial` | Create serial + seq + assign project |
| `POST /api/f1/err/assign-grant` | Assign existing grant serial |
| `POST /api/f1/err/feedback` | Feedback row + project status/version |
| `POST /api/f1/err/move-to-f2` | Staging projects → `status: pending` |

---

## Next when you resume

**Phase 4** — tighten `err_projects` RLS (and related) after reviewing who may still call Supabase directly for **reads**. **Phase 5** — XSS audit on rendered project fields.
