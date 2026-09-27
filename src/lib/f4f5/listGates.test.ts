import { describe, expect, it } from 'vitest'
import {
  hasValidGrantAssignment,
  parseCompletionMode,
  projectMatchesF4CompletionMode,
  projectMatchesF5CompletionMode,
  rowMatchesF4CompletionMode,
  rowMatchesF5CompletionMode,
  shouldIncludeHistoricalF4Rows,
} from './listGates'

describe('parseCompletionMode', () => {
  it('defaults to active', () => {
    expect(parseCompletionMode(null)).toBe('active')
    expect(parseCompletionMode('')).toBe('active')
    expect(parseCompletionMode('active')).toBe('active')
  })
  it('parses completed and all', () => {
    expect(parseCompletionMode('completed')).toBe('completed')
    expect(parseCompletionMode('ALL')).toBe('all')
  })
})

describe('grant assignment', () => {
  const valid = new Set(['grid-1'])

  it('includes valid grant_grid_id', () => {
    expect(hasValidGrantAssignment({ grant_grid_id: 'grid-1' }, valid)).toBe(true)
  })
  it('excludes null grant_grid_id', () => {
    expect(hasValidGrantAssignment({ grant_grid_id: null }, valid)).toBe(false)
  })
  it('excludes orphan grant_grid_id', () => {
    expect(hasValidGrantAssignment({ grant_grid_id: 'missing' }, valid)).toBe(false)
  })
})

describe('F4 completion', () => {
  it('treats f4_status completed as completed', () => {
    expect(projectMatchesF4CompletionMode({ f4_status: 'completed' }, 'completed')).toBe(true)
    expect(projectMatchesF4CompletionMode({ f4_status: 'completed' }, 'active')).toBe(false)
  })
  it('treats complete_no_report row as completed via classifier', () => {
    const row = {
      has_f4_report: false,
      f4_status: 'completed',
      report_status: 'complete_no_report',
    }
    expect(rowMatchesF4CompletionMode(row, 'completed')).toBe(true)
    expect(rowMatchesF4CompletionMode(row, 'active')).toBe(false)
  })
  it('keeps accepted but not completed in active', () => {
    const row = {
      has_f4_report: true,
      f4_status: 'partial',
      report_status: 'accepted',
      review_status: 'accepted',
    }
    expect(rowMatchesF4CompletionMode(row, 'active')).toBe(true)
    expect(rowMatchesF4CompletionMode(row, 'completed')).toBe(false)
  })
})

describe('F5 completion', () => {
  it('treats f5_status completed as completed', () => {
    expect(projectMatchesF5CompletionMode({ f5_status: 'completed' }, 'completed')).toBe(true)
    expect(projectMatchesF5CompletionMode({ f5_status: 'waiting' }, 'active')).toBe(true)
  })
  it('uploaded but not completed stays active', () => {
    const row = { has_f5_report: true, f5_status: 'partial', report_status: 'uploaded' }
    expect(rowMatchesF5CompletionMode(row, 'active')).toBe(true)
    expect(rowMatchesF5CompletionMode(row, 'completed')).toBe(false)
  })
  it('complete_no_report without upload is completed', () => {
    const row = {
      has_f5_report: false,
      f5_status: 'completed',
      report_status: 'complete_no_report',
    }
    expect(rowMatchesF5CompletionMode(row, 'completed')).toBe(true)
  })
})

describe('historical F4', () => {
  it('excludes historical when completion=completed', () => {
    expect(shouldIncludeHistoricalF4Rows('completed')).toBe(false)
    expect(shouldIncludeHistoricalF4Rows('active')).toBe(true)
    expect(shouldIncludeHistoricalF4Rows('all')).toBe(true)
  })
})
