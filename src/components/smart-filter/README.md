# Smart Dynamic Filter

Production-ready reusable filter component: **Add Filter** → dropdown of fields → each selection becomes a **chip** (label + input + remove). Filters combine with **AND** logic. Optional **URL sync** and **Clear all**.

## Folder structure

```
src/components/smart-filter/
├── types.ts           # FilterFieldConfig, ActiveFilter, FilterValues, SmartFilterProps
├── filter-config.tsx  # getReportTrackerFilterFields() – field definitions for Report Tracker
├── FilterChip.tsx     # Single chip UI (label + text/select/date/date_range input + X)
├── SmartFilter.tsx    # Main component (Add Filter dropdown, chips, Clear all, URL sync)
├── useFilteredData.ts # applyFilters() – client-side AND logic
├── example-usage.tsx  # Example with mock data
├── index.ts           # Public exports
└── README.md
```

## Usage

1. **Define fields** (or use `getReportTrackerFilterFields` for Report Tracker):

```ts
const fields = getReportTrackerFilterFields({ stateOptions: ['A','B'], donorOptions: ['X','Y'] })
```

2. **Controlled state + SmartFilter**:

```tsx
const [filters, setFilters] = useState<ActiveFilter[]>([])

<SmartFilter
  fields={fields}
  filters={filters}
  onFiltersChange={setFilters}
  urlParamPrefix="f_"
  title="Report Tracker"
  count={filteredData.length}
/>
```

3. **Apply filters to data (AND logic)**:

```tsx
const getFieldValue = (row, fieldId) =>
  fieldId === 'date_range' ? row.date : row[fieldId]

const filteredData = applyFilters({
  data: rows,
  filters,
  fields,
  getFieldValue,
})
```

4. **Server-side**: Use `parseFiltersFromSearchParams(searchParams, 'f_')` in a Server Component or API to read filters from the URL and run your query.

## Available filters (Report Tracker)

- **Project Donor** (select)
- **F4 Status** (select)
- **F5 Status** (select)
- **State** (select)
- **Date Range** (from/to date inputs)

## Reuse

- Add new field types in `types.ts` and handle them in `FilterChip.tsx` and `applyFilters`.
- For another page, add a new config (e.g. `getMyPageFilterFields`) in `filter-config.tsx` or a separate config file.
