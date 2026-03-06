## Dashboard charts – data & filtering

This document explains how the two **Dashboard (Work‑in‑progress)** charts on `/err-portal/dashboard` are wired up:

- **USD by Donor over Time**
- **Grants by amount**

It covers their data sources, how the server APIs aggregate data, and how the shared date range filter works.

---

### 1. Components and routes

- **Page component**: `src/app/err-portal/dashboard/page.tsx`
  - Renders the “Dashboard (Work‑in‑progress)” section inside a `CollapsibleRow`.
  - Hosts a **SmartFilter** instance for the **Date range** filter.
  - Passes the selected date range down as props to both charts:
    - `ProjectsByDonorChart dateFrom={...} dateTo={...}`
    - `GrantsStackedBarChart dateFrom={...} dateTo={...}`

- **Chart components**:
  - `src/app/err-portal/dashboard/ProjectsByDonorChart.tsx`
    - Renders the **USD by Donor over Time** area chart using Recharts.
  - `src/app/err-portal/dashboard/GrantsStackedBarChart.tsx`
    - Renders the **Grants by amount** stacked bar chart using Recharts.

- **APIs backing the charts**:
  - `GET /api/dashboard/projects-activities`
    - File: `src/app/api/dashboard/projects-activities/route.ts`
  - `GET /api/dashboard/grants-chart`
    - File: `src/app/api/dashboard/grants-chart/route.ts`

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

### 3. Grants by amount

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

### 4. Shared date range filter (cross‑filtering)

The **cross‑filtering** behaviour comes from the shared **SmartFilter date_range chip** on the dashboard page.

#### 4.1 SmartFilter configuration

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

#### 4.2 How it cross‑filters both charts

- The **same date range** is applied to both chart APIs:
  - `ProjectsByDonorChart` → `/api/dashboard/projects-activities?from=&to=`
  - `GrantsStackedBarChart` → `/api/dashboard/grants-chart?from=&to=`
- Because both APIs:
  - Respect the same `from` / `to` semantics.
  - Filter on date fields before aggregating.
- The result is a **consistent cross‑filter**:
  - The donor‑over‑time area chart only includes activity rows inside the selected date range.
  - The grants‑by‑amount bar chart only includes grants whose `grant_start_date`/`grant_end_date` fall inside the same window.

If you change or clear the date‑range chip:

- The SmartFilter updates `filters` and the URL.
- The dashboard page recomputes `dateFrom` / `dateTo` props.
- Both charts refetch and update together.

---

### 5. Extending or reusing this setup

- **Adding more filters**:
  - You can extend `dateFilterFields` in `dashboard/page.tsx` with additional `FilterFieldConfig` items (e.g. donor, grant segment) and propagate their values as query params to one or both APIs.
  - The SmartFilter system is already used heavily on `/err-portal/report-tracker` and `/err-portal/project-management`; mirror those patterns.

- **Changing date semantics**:
  - If you want both charts to use the **same underlying date field** (e.g. always `date_transfer`), ensure the APIs align on which DB column they use in their `gte` / `lte` filters.

- **Reusing the charts elsewhere**:
  - Both chart components are self‑contained and accept `dateFrom` / `dateTo` props.
  - You can render them in other pages and drive them with any date UI (another SmartFilter instance, simple inputs, etc.), as long as you pass the same ISO `YYYY-MM-DD` strings into their props.

