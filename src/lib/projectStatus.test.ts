import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  buildReportingStatusUpdatePayload,
  computeReportingStatusUpdate,
  reportingStatusUpdateHasEffectiveChange,
  type ReportingStatusProjectRow,
} from './projectStatus'

function row(overrides: Partial<ReportingStatusProjectRow> = {}): ReportingStatusProjectRow {
  return {
    status: 'active',
    f4_status: 'waiting',
    f5_status: 'waiting',
    date_report_completed: null,
    completed_at: null,
    ...overrides,
  }
}

/** Minimal stub — resolveReportCompletedDate falls back to today when rows empty. */
function mockSupabase(): SupabaseClient {
  const emptyLimit = Promise.resolve({ data: [] as { created_at: string }[], error: null })
  const chain = {
    select: () => chain,
    eq: () => chain,
    order: () => chain,
    limit: () => emptyLimit,
  }
  return {
    from: () => chain,
  } as unknown as SupabaseClient
}

describe('reporting-status effective update / no-op guard', () => {
  it('A: re-PATCH completed f4 when both sides and project already completed → no effective change', async () => {
    const project = row({
      status: 'completed',
      f4_status: 'completed',
      f5_status: 'completed',
      date_report_completed: '2024-06-01',
      completed_at: '2024-06-01T12:00:00.000Z',
    })
    const update = await buildReportingStatusUpdatePayload(
      mockSupabase(),
      'proj-1',
      project,
      { f4_status: 'completed' }
    )
    assert.equal(reportingStatusUpdateHasEffectiveChange(project, update), false)
    const preview = await computeReportingStatusUpdate(mockSupabase(), 'proj-1', project, {
      f4_status: 'completed',
    })
    assert.equal(preview.hasEffectiveChange, false)
  })

  it('B: completing f5 when f4 already completed → auto-complete fields in update', async () => {
    const project = row({
      status: 'active',
      f4_status: 'completed',
      f5_status: 'partial',
    })
    const update = await buildReportingStatusUpdatePayload(
      mockSupabase(),
      'proj-1',
      project,
      { f5_status: 'completed' }
    )
    assert.equal(update.f5_status, 'completed')
    assert.equal(update.status, 'completed')
    assert.ok(update.completed_at)
    assert.ok(update.date_report_completed)
    assert.equal(reportingStatusUpdateHasEffectiveChange(project, update), true)
  })

  it('C: f5 no-op request still clears date_report_completed when both sides not completed', async () => {
    const project = row({
      f4_status: 'partial',
      f5_status: 'completed',
      date_report_completed: '2024-03-15',
    })
    const update = await buildReportingStatusUpdatePayload(
      mockSupabase(),
      'proj-1',
      project,
      { f5_status: 'completed' }
    )
    assert.equal(update.date_report_completed, null)
    assert.equal(reportingStatusUpdateHasEffectiveChange(project, update), true)
  })

  it('D: completing f5 while f4 already completed → meaningful update', async () => {
    const project = row({
      status: 'active',
      f4_status: 'completed',
      f5_status: 'partial',
    })
    const preview = await computeReportingStatusUpdate(mockSupabase(), 'proj-1', project, {
      f4_status: 'completed',
      f5_status: 'completed',
    })
    assert.equal(preview.hasEffectiveChange, true)
    assert.equal(preview.update.f5_status, 'completed')
  })

  it('E: partial body — unchanged f4 and changed f5 → effective change', async () => {
    const project = row({ f4_status: 'partial', f5_status: 'partial' })
    const preview = await computeReportingStatusUpdate(mockSupabase(), 'proj-1', project, {
      f4_status: 'partial',
      f5_status: 'completed',
    })
    assert.equal(preview.hasEffectiveChange, true)
    assert.equal(preview.update.f5_status, 'completed')
  })

  it('F: backfill date_report_completed when both completed but date null → effective change', async () => {
    const project = row({
      f4_status: 'completed',
      f5_status: 'completed',
      date_report_completed: null,
    })
    const preview = await computeReportingStatusUpdate(mockSupabase(), 'proj-1', project, {
      f4_status: 'completed',
    })
    assert.equal(preview.hasEffectiveChange, true)
    assert.ok(preview.update.date_report_completed)
  })

  it('F2: date populated → null is effective change', () => {
    const project = row({ date_report_completed: '2024-01-01' })
    assert.equal(
      reportingStatusUpdateHasEffectiveChange(project, { date_report_completed: null }),
      true
    )
  })

  it('F3: same date_report_completed value → no effective change for that field alone', () => {
    const project = row({ date_report_completed: '2024-01-01' })
    assert.equal(
      reportingStatusUpdateHasEffectiveChange(project, { date_report_completed: '2024-01-01' }),
      false
    )
  })
})
