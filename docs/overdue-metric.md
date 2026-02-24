# Overdue Metric

This document describes how the **Overdue** metric is calculated and where it is implemented in the Sudan ERR Portal.

---

## 1. Definition

A project is **overdue** when:

1. A **transfer date** is known (funds were transferred to the ERR).
2. The **due date** has passed. The due date is **Transfer date + 32 days**.
3. The project is **not complete**. A project is complete for overdue purposes when **both F4 and F5** have a status of **completed**, **in review**, **under review**, or **partial** (or when at least one F4 summary / F5 report exists).

If all three conditions hold, the project is overdue and we report **days overdue** = (today − due date) in whole days.

---

## 2. Calculation (formula)

```
Due date     = Transfer date + 32 days
Is complete  = (F4 status is complete) AND (F5 status is complete)
Is overdue   = (Transfer date is set) AND (Due date < today) AND (NOT Is complete)
Days overdue = When overdue: (today − Due date) in whole days; otherwise empty/null
```

**Complete for overdue:** F4 (and F5) is considered complete when:
- There is at least one F4 summary / F5 report for the project, **or**
- Status is one of: **completed**, **in review**, **under review**, **partial** (case-insensitive).

**Notes:**

- If there is no transfer date, the project is never considered overdue.
- If both F4 and F5 are complete (by the above rule), the project is not overdue even if the due date has passed.
- The 32-day window matches the logic used in the legacy Google tracker (P2H Tracker).

---

## 3. Data sources

### 3.1 Portal projects (`err_projects`)

- **Transfer date**
  - **Primary:** `err_projects.date_transfer` (when set).
  - **Fallback:** For projects linked to an MOU (`err_projects.mou_id`), the transfer date can be stored per project in the MOU’s **payment confirmation** data:
    - Table: `mous`
    - Column: `payment_confirmation_file` (JSON)
    - Shape: `{ "<project_id>": { "file_path", "exchange_rate", "transfer_date" }, ... }`
  - Effective transfer date = `date_transfer` OR `transfer_date` from the MOU JSON for that project.

- **F4 complete**
  - At least one F4 summary in `err_summary` for the project, **or** `err_projects.f4_status = 'completed'`.

- **F5 complete**
  - At least one F5 report in `err_program_report` for the project, **or** `err_projects.f5_status = 'completed'`.

### 3.2 Historical projects (`activities_raw_import`)

- Overdue is **not recalculated**.
- The legacy Google tracker stored an **Overdue** value (e.g. `"67"` days); this is synced into `activities_raw_import` (column `Overdue` or `overdue`).
- The app uses that stored value for:
  - **Counting** overdue projects (treat as overdue if the value is a non‑negative number).
  - **Display** (e.g. “67” days in tables and in the View Project modal).

---

## 4. Where it is implemented

### 4.1 Rollup API (`/api/overview/rollup`)

- **Purpose:** Feeds the Project Management table and aggregates (by state, by ERR, by grant).
- **Portal rows:** For each `err_projects` row:
  - Loads MOU `payment_confirmation_file` for projects with `mou_id` and parses per‑project `transfer_date`.
  - Computes effective transfer date, F4/F5 complete, then `is_overdue` and `days_overdue`.
  - Adds to each row: `is_overdue`, `days_overdue`, `overdue` (string for display).
- **Historical rows:** Reads `Overdue` from `activities_raw_import` and sets `is_overdue` (for counts) and `overdue` / `days_overdue` (for display).
- **Aggregations:** The UI aggregates by state and by ERR; overdue **counts** are derived by counting rows where `is_overdue === true`.

### 4.2 Project detail API (`/api/overview/project/[id]`)

- **Purpose:** Feeds the View Project modal.
- **Portal:** Selects `date_transfer`, `f4_status`, `f5_status`; loads MOU and parses `payment_confirmation_file` for this project’s `transfer_date`; computes overdue and attaches `date_transfer`, `overdue`, `days_overdue` to the project object.
- **Historical:** Project already includes `overdue` from the sheet; no extra computation.

### 4.3 Project Management page (`/err-portal/project-management`)

- **National (by state):** One column **Overdue** = count of projects overdue per state.
- **State (by ERR):** One column **Overdue** = count of projects overdue per ERR.
- **Project (by project):** One column **Overdue** = days overdue for that project (or blank/— when not overdue).
- **Summary by Grant table:** One column **Overdue** = count of projects overdue per grant.

### 4.4 View Project modal (`ProjectDetailModal`)

- When **Overdue > 0**, a banner is shown at the **top** of the modal with:
  - Title: e.g. “Overdue: X days”.
  - Short rule: “Due date = Transfer date + 32 days. Project is overdue until both F4 and F5 reports are complete.”
  - Formula line: “Transfer date: … → Due date: …. This project is X days overdue.”
- Works for both portal projects (using API‑computed `days_overdue` / `overdue`) and historical projects (using stored `overdue` from the sheet).

---

## 5. Code references

| What | Where |
|------|--------|
| Overdue constant (32 days) | `src/app/api/overview/rollup/route.ts`, `src/app/api/overview/project/[id]/route.ts` |
| `computeOverdue(transferDate, f4Complete, f5Complete)` | Same files |
| MOU transfer-date parsing | Rollup: `getTransferDateByProjectFromMous()`; project API: inline parse of `payment_confirmation_file` |
| Rollup portal row overdue | `src/app/api/overview/rollup/route.ts` (projRows mapping) |
| Rollup historical row overdue | `src/app/api/overview/rollup/route.ts` (historicalRows mapping) |
| State/room/grant overdue counts | `src/app/err-portal/project-management/components/ProjectManagement.tsx` (stateRows, roomRows, grantSummaryRows) |
| Overdue column and totals | Same file (table headers, cells, Total row) |
| Modal overdue banner | `src/app/err-portal/project-management/components/ProjectDetailModal.tsx` |
| i18n keys (Overdue, tooltip, modal) | `src/i18n/locales/en/projects.json`, `src/i18n/locales/ar/projects.json` |

---

## 6. Summary

- **Formula:** Due = Transfer + 32 days; overdue when due has passed and both F4 and F5 are not complete; days overdue = today − due date.
- **Portal:** Transfer date from `err_projects.date_transfer` or MOU payment confirmation JSON; F4/F5 complete from summaries/reports or status fields.
- **Historical:** Use stored `Overdue` from `activities_raw_import`; no recalculation.
- **UI:** Overdue appears as counts (by state, by ERR, by grant) and as days per project in the Project Management table, and as a top-of-modal banner with the calculation when opening a project with Overdue > 0.
