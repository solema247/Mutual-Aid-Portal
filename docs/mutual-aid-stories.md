# Mutual Aid Stories

This document describes the **Mutual Aid Stories** feature: a state- and theme-driven view of MAP (Mutual Aid Portal) project narratives for bottom-up storytelling.

---

## Overview

Mutual Aid Stories lets users browse and read project stories from the grassroots ERR level. Data comes only from MAP projects: `err_projects` (with `source = 'mutual_aid_portal'`), `err_program_report` (F5 narrative), and `err_program_reach` (activity-level reach). Users can navigate **by state** or **by theme**, then open a full story (Level 2) for a single project.

---

## User flow

- **Level 1** (`/err-portal/stories`): User chooses to browse **By state** or **By theme**. In the sidebar they select a state or a theme; the main area shows a **story-telly summary** (high-level facts and figures for that selection) and then **story cards** (only projects that have both F1 and F5). Each card shows project name, state/locality, a short narrative snippet, beneficiary count, and theme tags. "Read full story" links to Level 2.
- **Level 2** (`/err-portal/stories/[projectId]`): Full story page for one project: header (place, ERR, report date, reporting person), "At a glance" stats, narrative sections (objectives, what changed, challenges, unexpected results, lessons learned, suggestions), and "Where we worked" (reach table). Back link returns to Level 1 with context (e.g. "Back to Kassala" or "Back to theme").

---

## Data sources

- **err_projects**: F1 workplans; only rows with `source = 'mutual_aid_portal'` and `status` in `['approved','active','pending','completed']`. Used for state, locality, project name, objectives, estimated beneficiaries, and `planned_activities` (for themes).
- **err_program_report**: F5 program reports; fields `positive_changes`, `negative_results`, `unexpected_results`, `lessons_learned`, `suggestions`, `reporting_person`, `report_date`. Linked by `project_id`.
- **err_program_reach**: Activity-level reach per report; `location`, `activity_name`, `activity_goal`, `individual_count`, `household_count`, etc. Linked by `report_id`.

**State access**: All story APIs call `getUserStateAccess()` and filter `err_projects` by `allowedStateNames` when the user does not have "see all states". This matches the behaviour of Report Tracker and F5 list.

**Stories require F1 + F5**: Only projects that have at least one F5 program report are shown as story cards and included in state/theme counts. The options API counts only projects with F5; the cards API returns only projects with F5 and a **summary** of high-level facts for the selected state or theme (total projects, reports, beneficiaries, households, localities).

---

## Themes

Themes are derived from the **category** field of **planned_activities** on MAP projects:

- Each project’s `planned_activities` JSONB is parsed (same logic as `getActivityAndCategoryLists` in `src/lib/plannedActivitiesExpenses.ts`).
- Distinct values of **category** only are collected across all allowed projects (the `activity` field is not used for themes).
- Each unique category label is exposed as a theme with:
  - **id**: URL-safe slug (lowercase, spaces → hyphens, non-alphanumeric stripped), e.g. `education`.
  - **label**: Display name, e.g. "Education".
  - **project_count**: Number of projects that have at least one planned_activity with that category **and** at least one F5 report (same as story cards).

Filtering **by theme** in the cards API keeps only projects whose `planned_activities` contain at least one entry whose category slug matches the requested theme id. Card **theme_labels** show only category names for that project.

---

## APIs

| Method | Route | Description |
|--------|--------|-------------|
| GET | `/api/stories/options` | Returns `{ states, themes }`. Counts include only projects that have at least one F5 report. States: `{ state, project_count, report_count }`. Themes: `{ id, label, project_count }`. Respects `getUserStateAccess()`. |
| GET | `/api/stories/cards?state=...` or `?theme=...` | Returns `{ summary, cards }`. **summary**: `total_projects`, `total_reports`, `total_beneficiaries`, `total_households`, `total_usd` (sum of project expenses in USD), `locality_count`, `localities[]` (only projects with F5). **cards**: array of story cards (only projects with F5). Each card: `project_id`, `project_name`, `state`, `locality`, `objectives_snippet`, `positive_changes_snippet`, `report_date`, `reporting_person`, `beneficiaries_count`, `theme_labels`. Requires exactly one of `state` or `theme`. |
| GET | `/api/overview/project/[id]` | Existing API; used by Level 2 to load project, F5 reports with reach, and file keys. No changes. |

---

## Routes

| Path | Description |
|------|-------------|
| `/err-portal/stories` | Level 1: Option C layout (sidebar + story cards). |
| `/err-portal/stories/[projectId]` | Level 2: Full story for one project. |

**Query params (Level 1)**:

- `mode`: `state` or `theme` (default `state`).
- `state`: state name when `mode=state` (e.g. `Kassala`).
- `theme`: theme id (slug) when `mode=theme` (e.g. `community-kitchen`).

**Query params (Level 2)**:

- `fromState`: when present, back link goes to `/err-portal/stories?mode=state&state=...`.
- `fromTheme`: when present, back link goes to `/err-portal/stories?mode=theme&theme=...`.

Level 1 links to Level 2 with `?fromState=...` or `?fromTheme=...` so the back button restores the previous list view.

---

## Option C layout (Level 1)

- **Sidebar** (left on desktop; stacked above on small screens):
  - **Mode selector**: Tabs "By state" / "By theme".
  - **List**: When "By state", a list of states (name + project count). When "By theme", a list of themes (label + project count). The selected item is highlighted. Clicking an item updates the URL and loads the corresponding cards.
- **Main area**: If no state/theme is selected, a short message: "Select a state or theme to see stories." If a selection exists, a **story-telly summary** (one or two sentences with key numbers: projects, reports, beneficiaries, households, localities) and then a grid of **story cards** (only projects with F5). Each card has "Read full story" linking to `/err-portal/stories/[projectId]?fromState=...` or `?fromTheme=...`.

Responsive behaviour: on smaller viewports the sidebar and main content stack vertically (sidebar first).

---

## Navigation and permission

- The **Mutual Aid Stories** item appears in the ERR portal sidebar when the user has `f4_f5_view_page` (same as "F4 & F5 Reporting" and "Report Tracker"). It links to `/err-portal/stories`.
- Implemented in `src/app/err-portal/layout.tsx`; icon: `BookMarked`.

---

## Files

| Purpose | Path |
|--------|------|
| Stories options API | `src/app/api/stories/options/route.ts` |
| Story cards API | `src/app/api/stories/cards/route.ts` |
| Level 1 page | `src/app/err-portal/stories/page.tsx` |
| Level 2 page | `src/app/err-portal/stories/[projectId]/page.tsx` |
| Sidebar entry | `src/app/err-portal/layout.tsx` |
| Project detail (unchanged) | `src/app/api/overview/project/[id]/route.ts` |
