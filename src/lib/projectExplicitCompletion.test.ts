import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isExplicitProjectCompletionNoop,
  projectCompletedAuditNewValues,
  projectCompletedAuditOldValues,
} from './projectExplicitCompletion'

describe('explicit project completion (PATCH /status)', () => {
  it('A: first completion is not a no-op', () => {
    assert.equal(
      isExplicitProjectCompletionNoop({ status: 'active' }, 'completed'),
      false
    )
    const oldValues = projectCompletedAuditOldValues({
      status: 'active',
      completed_at: null,
    })
    assert.deepEqual(oldValues, { status: 'active', completed_at: null })
    const ts = '2026-03-27T10:00:00.000Z'
    assert.deepEqual(projectCompletedAuditNewValues(ts), {
      status: 'completed',
      completed_at: ts,
    })
  })

  it('B: repeat completion is a no-op', () => {
    const t0 = '2026-01-15T08:30:00.000Z'
    assert.equal(
      isExplicitProjectCompletionNoop({ status: 'completed' }, 'completed'),
      true
    )
    assert.equal(
      isExplicitProjectCompletionNoop({ status: 'Completed' }, 'completed'),
      true
    )
    const oldValues = projectCompletedAuditOldValues({
      status: 'completed',
      completed_at: t0,
    })
    assert.equal(oldValues.completed_at, t0)
  })

  it('C: reporting gate is separate — incomplete reporting does not imply no-op', () => {
    assert.equal(
      isExplicitProjectCompletionNoop({ status: 'active' }, 'completed'),
      false
    )
  })

  it('E: non-complete requested status is never a completion no-op', () => {
    assert.equal(
      isExplicitProjectCompletionNoop({ status: 'completed' }, 'active'),
      false
    )
    assert.equal(
      isExplicitProjectCompletionNoop({ status: 'active' }, 'active'),
      false
    )
  })

  it('preserves prior completed_at in audit old_values when re-completing from non-completed status', () => {
    const prior = '2025-12-01T00:00:00.000Z'
    const oldValues = projectCompletedAuditOldValues({
      status: 'active',
      completed_at: prior,
    })
    assert.equal(oldValues.completed_at, prior)
  })
})
