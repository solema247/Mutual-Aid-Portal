import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { KNOWN_AUDIT_ACTIONS } from './auditActionLabels'
import { getActionsForAuditArea, resolveEffectiveAuditActions } from './auditAreas'

describe('getActionsForAuditArea F4/F5 workspaces', () => {
  it('all activity includes every known action unchanged', () => {
    assert.deepEqual(getActionsForAuditArea('all'), KNOWN_AUDIT_ACTIONS)
  })

  it('f4 includes all f4.* plus reporting/completion project actions', () => {
    const f4 = getActionsForAuditArea('f4')
    const f4Prefixed = KNOWN_AUDIT_ACTIONS.filter((a) => a.startsWith('f4.'))
    for (const action of f4Prefixed) {
      assert(f4.includes(action), `f4 missing ${action}`)
    }
    assert(f4.includes('project.reporting_status_changed'))
    assert(f4.includes('project.completed'))
    assert(!f4.includes('project.implemented_sector_changed'))
    assert(f4.every((a) => a.startsWith('f4.') || a.startsWith('project.reporting') || a === 'project.completed'))
  })

  it('f5 includes all f5.* plus reporting/completion project actions', () => {
    const f5 = getActionsForAuditArea('f5')
    const f5Prefixed = KNOWN_AUDIT_ACTIONS.filter((a) => a.startsWith('f5.'))
    for (const action of f5Prefixed) {
      assert(f5.includes(action), `f5 missing ${action}`)
    }
    assert(f5.includes('project.reporting_status_changed'))
    assert(f5.includes('project.completed'))
    assert(!f5.includes('project.implemented_sector_changed'))
  })

  it('resolveEffectiveAuditActions f4 allows project.reporting_status_changed', () => {
    const effective = resolveEffectiveAuditActions('f4', ['project.reporting_status_changed'])
    assert.deepEqual(effective, ['project.reporting_status_changed'])
  })

  it('resolveEffectiveAuditActions f4 still excludes unrelated actions', () => {
    assert.equal(resolveEffectiveAuditActions('f4', ['user.role_changed']).length, 0)
  })
})
