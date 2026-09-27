import { describe, expect, it } from 'vitest'
import {
  classifyF4ListRowForSummary,
  computeF4ListSummary,
  computeF5ListSummary,
  parseReportingListSummary,
} from './listSummary'

describe('computeF4ListSummary', () => {
  it('counts full filtered set buckets', () => {
    const rows = [
      { has_f4_report: false, f4_status: 'waiting', report_status: 'not_uploaded' },
      { has_f4_report: true, f4_status: 'completed', report_status: 'accepted' },
      { has_f4_report: true, f4_status: 'in review', report_status: 'pending_review' },
      { has_f4_report: false, f4_status: 'completed', report_status: 'complete_no_report' },
    ]
    expect(computeF4ListSummary(rows)).toEqual({
      total: 4,
      completed: 2,
      underReview: 1,
      notUploaded: 1,
    })
  })

  it('matches handler-shaped portal uploaded row (report_status from server)', () => {
    const rows = [
      {
        id: 42,
        has_f4_report: true,
        f4_status: 'partial',
        report_status: 'pending_review',
        review_status: 'pending_review',
        activities_raw_import_id: null,
      },
      {
        id: null,
        has_f4_report: false,
        f4_status: 'waiting',
        report_status: 'not_uploaded',
        review_status: null,
        activities_raw_import_id: null,
      },
    ]
    const summary = computeF4ListSummary(rows)
    expect(summary.total).toBe(2)
    expect(summary.notUploaded).toBe(1)
    expect(summary.completed).toBe(0)
    expect(summary.underReview).toBe(0)
  })

  it('classifies historical rows via computeF4ReportStatus when report_status omitted', () => {
    const row = {
      id: 1,
      has_f4_report: true,
      activities_raw_import_id: 'imp-1',
      review_status: 'pending_review',
    }
    expect(classifyF4ListRowForSummary(row)).toBe('other')
    expect(computeF4ListSummary([row]).total).toBe(1)
  })
})

describe('computeF5ListSummary', () => {
  it('includes waiting/partial in underReview', () => {
    const rows = [
      { has_f5_report: true, f5_status: 'partial', report_status: 'uploaded' },
      { has_f5_report: false, f5_status: 'waiting', report_status: 'not_uploaded' },
    ]
    expect(computeF5ListSummary(rows)).toEqual({
      total: 2,
      completed: 0,
      underReview: 1,
      notUploaded: 1,
    })
  })

  it('matches handler-shaped F5 portal row', () => {
    const rows = [
      { id: 'uuid', has_f5_report: true, f5_status: 'waiting', report_status: 'uploaded' },
    ]
    expect(computeF5ListSummary(rows).underReview).toBe(1)
    expect(computeF5ListSummary(rows).total).toBe(1)
  })
})

describe('parseReportingListSummary', () => {
  it('reads camelCase and snake_case', () => {
    expect(
      parseReportingListSummary({
        total: 10,
        completed: 2,
        under_review: 3,
        not_uploaded: 5,
      })
    ).toEqual({
      total: 10,
      completed: 2,
      underReview: 3,
      notUploaded: 5,
    })
  })

  it('returns null for missing shape', () => {
    expect(parseReportingListSummary(undefined)).toBeNull()
    expect(parseReportingListSummary({ foo: 1 })).toBeNull()
  })
})
