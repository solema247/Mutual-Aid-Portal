## Dashboard charts – data & filtering

This document explains how the three **Dashboard (Work‑in‑progress)** charts on `/err-portal/dashboard` are wired up:

- **USD by Donor over Time**
- **Grants by Amount**
- **F1 Work Plans by Sector**

It covers their data sources, how the server APIs aggregate data, and how the shared date range filter works. Each chart also has a **Download CSV** button in the header.

---

### 1. Components and routes

- **Page component**: `src/app/err-portal/dashboard/page.tsx`
  - Renders the “Dashboard (Work‑in‑progress)” section inside a `CollapsibleRow`.
  - Hosts a **SmartFilter** instance for the **Date range** filter.
  - Passes the selected date range down as props to all three charts:
    - `ProjectsByDonorChart dateFrom={...} dateTo={...}`
    - `GrantsStackedBarChart dateFrom={...} dateTo={...}`
    - `PlannedCategoriesRingChart dateFrom={...} dateTo={...}`

- **Chart components**:
  - `src/app/err-portal/dashboard/ProjectsByDonorChart.tsx`
    - Renders the **USD by Donor over Time** area chart using Recharts.
  - `src/app/err-portal/dashboard/GrantsStackedBarChart.tsx`
    - Renders the **Grants by Amount** stacked bar chart using Recharts.
  - `src/app/err-portal/dashboard/PlannedCategoriesRingChart.tsx`
    - Renders the **F1 Work Plans by Sector** donut/ring chart using Recharts (metric dropdown: USD Amount, Individuals, Families).

- **APIs backing the charts**:
  - `GET /api/dashboard/projects-activities`
    - File: `src/app/api/dashboard/projects-activities/route.ts`
  - `GET /api/dashboard/grants-chart`
    - File: `src/app/api/dashboard/grants-chart/route.ts`
  - `GET /api/dashboard/planned-categories`
    - File: `src/app/api/dashboard/planned-categories/route.ts`

Both APIs are marked `dynamic = 'force-dynamic'` and `fetchCache = 'force-no-store'`, so they always run on the server and are never statically cached.

---

### 2. USD by Donor over Time

#### 2.1 Data source

API: `GET /api/dashboard/projects-activities`

- Supabase source: **`projects_all_activities_view`** (a view).
- Fields selected:
  - `date_transfer` – the transfer date for an activity / project row.
  - `project_donor` – donor name / identifier.
  - `usd` – USD amount for this row.

The API fetches all rows (paginated in batches of 1000) and then:

1. **Normalises date**:
   - Uses `toDateKey(date_transfer)` to drop invalid dates.
2. **Aggregates per (date, donor)**:
   - Builds a `Map<dateKey, Map<donor, amount>>` of summed USD per donor per day.
3. **Ranks donors**:
   - Computes total USD per donor across all dates.
   - Keeps the **top 10 donors** by total USD (`MAX_SERIES = 10`).
4. **Builds cumulative series**:
   - For each top donor, walks dates in chronological order and computes a **running total**:
     - At each date `d`: `cum[d] = cum[d − 1] + increment(d)`.
   - This means each donor’s line shows **cumulative USD over time**.
5. **Response shape**:
   - `chartData`: array of points:
     - `{ date_transfer: "YYYY-MM-DD", "<DONOR_A>": cumulativeUsdA, "<DONOR_B>": cumulativeUsdB, ... }`
   - `series`: array of donor names (top 10).

The chart component (`ProjectsByDonorChart`) uses:

- `AreaChart` with `XAxis dataKey="date_transfer"`.
- One `Area` per donor name in `series`.
- A legend-like row showing each donor with a coloured swatch.

#### 2.2 Date range filtering

The API supports optional query parameters:

- `from` – ISO date string (inclusive).
- `to` – ISO date string (inclusive).

In `projects-activities/route.ts`:

- If `from` is present, the Supabase query does `gte('date_transfer', from)`.
- If `to` is present, the query does `lte('date_transfer', to)`.
- Filtering happens **before** aggregation, so both the donor totals and the dates included are constrained to the selected window.

On the client:

- `ProjectsByDonorChart` accepts `dateFrom` / `dateTo` props.
- It constructs the API URL:
  - If both are empty: `/api/dashboard/projects-activities`
  - If set: `/api/dashboard/projects-activities?from=YYYY-MM-DD&to=YYYY-MM-DD` (only including the params that are defined).
- When the `dateFrom` / `dateTo` props change, the chart refetches and rerenders.

---

### 3. Grants by Amount

#### 3.1 Data source

API: `GET /api/dashboard/grants-chart`

- Supabase source: **`grants`** (foreign table).
- Fields selected:
  - `grant_id`
  - `total_transferred_amount_usd`
  - `sum_transfer_fee_amount`
  - `sum_activity_amount`

The API:

1. Fetches all grants (batched) ordered by `grant_id`.
2. For each row:
   - Normalises values to numbers:
     - `total = Number(total_transferred_amount_usd) || 0`
     - `fee = Number(sum_transfer_fee_amount) || 0`
     - `activity = Number(sum_activity_amount) || 0`
   - Computes:
     - `balance = max(0, total − fee − activity)`.
3. Filters out rows with empty `grant_id`.
4. Returns `GrantsChartRow[]`:
   - `grant_id`
   - `total_transferred_amount_usd`
   - `sum_transfer_fee_amount`
   - `sum_activity_amount`
   - `balance`

The chart (`GrantsStackedBarChart`) renders:

- `BarChart` with `XAxis dataKey="grant_id"`.
- Three stacked bars (`stackId="a"`):
  - `sum_transfer_fee_amount` (transfer fee).
  - `sum_activity_amount` (activity).
  - `balance` (remaining).
- A footer row showing:
  - `Total transferred (all grants):` sum of `total_transferred_amount_usd` across all visible rows.

#### 3.2 Date range filtering

The API supports optional query parameters:

- `from` – ISO date string (inclusive).
- `to` – ISO date string (inclusive).

Filtering logic:

- If `from` is present, the query does:
  - `gte('grant_start_date', from)`
- If `to` is present, the query does:
  - `lte('grant_end_date', to)`
- These comparisons scope **which grants** are returned; the amounts are then computed as usual.

On the client:

- `GrantsStackedBarChart` accepts `dateFrom` / `dateTo` props.
- It builds the URL in the same way as `ProjectsByDonorChart`:
  - `/api/dashboard/grants-chart?from=...&to=...`
- When the props change, it refetches and redraws.

---

### 4. F1 Work Plans by Sector

#### 4.1 Data source

API: `GET /api/dashboard/planned-categories`

- Supabase source: **`err_projects`** (portal projects only: `source = 'mutual_aid_portal'`).
- Fields used: `date`, `state`, `planned_activities` (JSONB).

The API:

1. Fetches rows filtered by status (`approved`, `active`, `pending`, `completed`), optional date range (`from` / `to` on `err_projects.date`), and state access.
2. Parses each row’s `planned_activities` JSON array (each item has `category`, `planned_activity_cost`, `families`, `individuals`).
3. Aggregates per category:
   - **total**: sum of `planned_activity_cost` (null/invalid → 0).
   - **families**: sum of `families` (null → 0).
   - **individuals**: sum of `individuals` (null → 0).
4. Counts **projectCount**: number of projects that contributed at least one activity with valid cost.
5. Returns: `{ projectCount, categories: [ { category, total, families, individuals }, ... ] }` sorted by `total` descending.

The chart (`PlannedCategoriesRingChart`) renders:

- A **donut/ring** (Recharts `PieChart` with `innerRadius`), one segment per category (only categories with value > 0 for the selected metric).
- A **metric dropdown** (pill-style) in the header: **USD Amount**, **Individuals**, **Families**. One metric per view; the pie and centre label show that metric’s totals.
- Centre label: sum for the selected metric plus “Total planned” / “Total individuals” / “Total families”, and project count.
- External labels per segment (with connector lines for small segments). Tooltip: value and % of total.
- **Download CSV**: exports Category, Total (USD), Individuals, Families.

#### 4.2 Date range filtering

- Query params `from` / `to` (ISO date, inclusive) filter on **`err_projects.date`**.
- The chart receives `dateFrom` / `dateTo` from the dashboard page and refetches when they change.

---

### 5. Shared date range filter (cross‑filtering)

The **cross‑filtering** behaviour comes from the shared **SmartFilter date_range chip** on the dashboard page.

#### 5.1 SmartFilter configuration

In `dashboard/page.tsx`:

- The page uses `SmartFilter` from `src/components/smart-filter` with a single field:
  - `id: 'date_range'`
  - `type: 'date_range'`
  - `placeholder: 'From – To'`
- Filter state is stored as `filters: ActiveFilter[]`.
- `urlParamPrefix="d_"` means:
  - `d_date_range_from` and `d_date_range_to` appear in the query string when a range is active.
  - This mirrors how SmartFilter works on **Report Tracker** and **Project Management**.

The currently selected dates are derived from the filter value:

- Find the `filters` entry where `fieldId === 'date_range'`.
- When present, its `value` is a `[from, to]` tuple of `YYYY-MM-DD` strings (or empty strings).
- The page then passes these through as:
  - `dateFrom = from || ''`
  - `dateTo = to || ''`

#### 5.2 How it cross‑filters all charts

- The **same date range** is applied to all three chart APIs:
  - `ProjectsByDonorChart` → `/api/dashboard/projects-activities?from=&to=`
  - `GrantsStackedBarChart` → `/api/dashboard/grants-chart?from=&to=`
  - `PlannedCategoriesRingChart` → `/api/dashboard/planned-categories?from=&to=`
- Because all APIs:
  - Respect the same `from` / `to` semantics.
  - Filter on date fields before aggregating.
- The result is a **consistent cross‑filter**:
  - The donor‑over‑time area chart only includes activity rows inside the selected date range.
  - The grants‑by‑amount bar chart only includes grants whose `grant_start_date`/`grant_end_date` fall inside the same window.
  - The F1 work plans ring chart only includes portal projects whose `date` falls inside the selected range.

If you change or clear the date‑range chip:

- The SmartFilter updates `filters` and the URL.
- The dashboard page recomputes `dateFrom` / `dateTo` props.
- All three charts refetch and update together.

---

### 6. Extending or reusing this setup

- **Adding more filters**:
  - You can extend `dateFilterFields` in `dashboard/page.tsx` with additional `FilterFieldConfig` items (e.g. donor, grant segment) and propagate their values as query params to one or both APIs.
  - The SmartFilter system is already used heavily on `/err-portal/report-tracker` and `/err-portal/project-management`; mirror those patterns.

- **Changing date semantics**:
  - If you want both charts to use the **same underlying date field** (e.g. always `date_transfer`), ensure the APIs align on which DB column they use in their `gte` / `lte` filters.

- **Reusing the charts elsewhere**:
  - All three chart components are self‑contained and accept `dateFrom` / `dateTo` props (and `PlannedCategoriesRingChart` has no extra props).
  - You can render them in other pages and drive them with any date UI (another SmartFilter instance, simple inputs, etc.), as long as you pass the same ISO `YYYY-MM-DD` strings into their props.

