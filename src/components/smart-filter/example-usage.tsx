'use client'

/**
 * Example usage of SmartFilter with mock data.
 * Copy this pattern to use in any page (client component).
 */

import * as React from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  SmartFilter,
  getReportTrackerFilterFields,
  applyFilters,
  type ActiveFilter,
} from '@/components/smart-filter'

// Mock row type (matches Report Tracker shape)
interface MockRow {
  id: string
  grant_id: string
  state: string
  locality: string
  err_code: string
  project_name: string
  donor: string | null
  date: string | null
  transfer_date: string | null
  f4_status: string
  f5_status: string
}

const MOCK_DATA: MockRow[] = [
  { id: '1', grant_id: 'G-001', state: 'Khartoum', locality: 'Central', err_code: 'ERR-1', project_name: 'Project A', donor: 'UNICEF', date: '2024-01-15', transfer_date: '2024-02-01', f4_status: 'completed', f5_status: 'pending' },
  { id: '2', grant_id: 'G-002', state: 'Khartoum', locality: 'North', err_code: 'ERR-2', project_name: 'Project B', donor: 'WFP', date: '2024-02-20', transfer_date: '2024-03-01', f4_status: 'partial', f5_status: 'completed' },
  { id: '3', grant_id: 'G-003', state: 'Kassala', locality: 'East', err_code: 'ERR-3', project_name: 'Project C', donor: 'UNICEF', date: '2024-03-10', transfer_date: null, f4_status: 'waiting', f5_status: 'waiting' },
  { id: '4', grant_id: 'G-004', state: 'Khartoum', locality: 'South', err_code: 'ERR-4', project_name: 'Project D', donor: 'ICRC', date: '2024-01-05', transfer_date: '2024-01-20', f4_status: 'in review', f5_status: 'partial' },
  { id: '5', grant_id: 'G-005', state: 'Kassala', locality: 'West', err_code: 'ERR-5', project_name: 'Project E', donor: 'WFP', date: '2024-04-01', transfer_date: null, f4_status: 'completed', f5_status: 'completed' },
]

export function SmartFilterExample() {
  const [filters, setFilters] = React.useState<ActiveFilter[]>([])

  const stateOptions = React.useMemo(() => ['Khartoum', 'Kassala', 'Red Sea'], [])
  const donorOptions = React.useMemo(() => ['UNICEF', 'WFP', 'ICRC'], [])

  const fields = React.useMemo(
    () => getReportTrackerFilterFields({ stateOptions, donorOptions }),
    [stateOptions, donorOptions]
  )

  const getFieldValue = React.useCallback((row: MockRow, fieldId: string): string | null | undefined => {
    if (fieldId === 'date_range') return row.date
    const key = fieldId as keyof MockRow
    const v = row[key]
    return v != null ? String(v) : null
  }, [])

  const filteredData = React.useMemo(
    () => applyFilters({ data: MOCK_DATA, filters, fields, getFieldValue }),
    [MOCK_DATA, filters, fields, getFieldValue]
  )

  return (
    <Card className="max-w-4xl mx-auto">
      <CardHeader className="border-b">
        <SmartFilter
          fields={fields}
          filters={filters}
          onFiltersChange={setFilters}
          urlParamPrefix="f_"
          title="Report Tracker (Example)"
          count={filteredData.length}
        />
      </CardHeader>
      <CardContent className="pt-4">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Grant ID</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Donor</TableHead>
              <TableHead>Date</TableHead>
              <TableHead>F4</TableHead>
              <TableHead>F5</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredData.map((row) => (
              <TableRow key={row.id}>
                <TableCell>{row.grant_id}</TableCell>
                <TableCell>{row.state}</TableCell>
                <TableCell>{row.donor ?? '—'}</TableCell>
                <TableCell>{row.date ?? '—'}</TableCell>
                <TableCell>{row.f4_status}</TableCell>
                <TableCell>{row.f5_status}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredData.length === 0 && (
          <p className="text-sm text-muted-foreground py-4 text-center">No rows match the filters.</p>
        )}
      </CardContent>
    </Card>
  )
}
