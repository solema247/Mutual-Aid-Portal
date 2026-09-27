import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { validateAuditLogTargetId } from './auditLog'
import {
  F5_REPORT_AUDIT_TARGET_TYPE,
  f5ReportAuditTarget,
  validateF5ReportAuditBind,
} from './f5ReportAuditTarget'

const SAMPLE_PROJECT_ID = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
const SAMPLE_REPORT_ID = 9042

describe('F5 report audit target_id', () => {
  it('uses project UUID as target_id (matches f4_summary pattern)', () => {
    const bind = f5ReportAuditTarget(SAMPLE_PROJECT_ID)
    assert.equal(bind.targetType, F5_REPORT_AUDIT_TARGET_TYPE)
    assert.equal(bind.targetId, SAMPLE_PROJECT_ID)
    assert.equal(validateF5ReportAuditBind(SAMPLE_PROJECT_ID).ok, true)
    assert.equal(validateAuditLogTargetId(bind.targetId).ok, true)
  })

  it('rejects legacy numeric err_program_report.id as target_id', () => {
    const legacy = validateAuditLogTargetId(String(SAMPLE_REPORT_ID))
    assert.equal(legacy.ok, false)
    if (!legacy.ok) {
      assert.match(legacy.error, /UUID/)
    }
  })

  it('canonical create/update/delete bind shape', () => {
    const bind = f5ReportAuditTarget(SAMPLE_PROJECT_ID)
    const metadata = {
      project_id: SAMPLE_PROJECT_ID,
      report_id: SAMPLE_REPORT_ID,
    }
    assert.deepEqual(
      {
        action: 'f5.report_created',
        target_type: bind.targetType,
        target_id: bind.targetId,
        metadata,
      },
      {
        action: 'f5.report_created',
        target_type: 'f5_report',
        target_id: SAMPLE_PROJECT_ID,
        metadata: {
          project_id: SAMPLE_PROJECT_ID,
          report_id: SAMPLE_REPORT_ID,
        },
      }
    )
  })
})
