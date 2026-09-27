/**
 * Phase 2 Audit Log foundation validation.
 *
 * Default: offline only (sanitization + request meta + taxonomy). No DB writes.
 * Optional: AUDIT_LOG_VALIDATE_WRITE=1 inserts one row via service role and deletes it.
 *
 * Usage:
 *   npx tsx scripts/validate-audit-log-foundation.ts
 *   AUDIT_LOG_VALIDATE_WRITE=1 npx tsx scripts/validate-audit-log-foundation.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import {
  AUDIT_ACTIONS,
  extractAuditRequestMeta,
  sanitizeAuditRecord,
  sanitizeAuditValue,
  validateAuditLogTargetId,
} from '../src/lib/auditLog'
import {
  f5ReportAuditTarget,
  validateF5ReportAuditBind,
} from '../src/lib/f5ReportAuditTarget'
import {
  auditFieldEqual,
  pickChangedAuditFields,
  USER_SCOPE_AUDIT_KEYS,
} from '../src/lib/userManagementAudit'

config({ path: resolve(process.cwd(), '.env.local') })

let failed = 0

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✓ ${message}`)
  } else {
    failed += 1
    console.error(`  ✗ ${message}`)
  }
}

function section(title: string) {
  console.log(`\n${title}`)
}

async function runOffline() {
  section('1. Taxonomy')
  assert(AUDIT_ACTIONS.includes('user.created'), 'user.created present')
  assert(AUDIT_ACTIONS.includes('user.deleted'), 'user.deleted present')
  assert(AUDIT_ACTIONS.includes('user.permission_changed'), 'user.permission_changed present')
  assert(AUDIT_ACTIONS.includes('f1.workplan_created'), 'f1.workplan_created present')
  assert(AUDIT_ACTIONS.includes('f2.committed'), 'f2.committed present')
  assert(AUDIT_ACTIONS.includes('f2.project_edited'), 'f2.project_edited present')
  assert(AUDIT_ACTIONS.includes('f3.mou_created'), 'f3.mou_created present')
  assert(AUDIT_ACTIONS.includes('f3.payment_confirmation_created'), 'f3.payment_confirmation_created present')
  assert(AUDIT_ACTIONS.includes('f4.report_created'), 'f4.report_created present')
  assert(AUDIT_ACTIONS.includes('f4.reviewed'), 'f4.reviewed present')
  assert(AUDIT_ACTIONS.includes('f5.report_created'), 'f5.report_created present')
  assert(AUDIT_ACTIONS.includes('project.reporting_status_changed'), 'project.reporting_status_changed present')
  assert(AUDIT_ACTIONS.includes('project.completed'), 'project.completed present')
  assert(AUDIT_ACTIONS.includes('project.implemented_sector_changed'), 'project.implemented_sector_changed present')
  // Role keys must remain internal strings in payloads, not renamed by helper
  const roles = sanitizeAuditRecord({
    role: 'base_err',
    previous: 'state_err',
  })
  assert(roles?.role === 'base_err', 'internal role key base_err preserved')
  assert(roles?.previous === 'state_err', 'internal role key state_err preserved')

  section('2. Sanitization')
  const dirty = sanitizeAuditRecord({
    display_name: 'Ada',
    password: 'secret-password',
    temporary_password: 'tmp-xyz',
    access_token: 'tok',
    refresh_token: 'ref',
    token: 'x',
    secret: 's',
    private_key: 'pk',
    service_role_key: 'srk',
    SUPABASE_SERVICE_KEY: 'ssk',
    nested: { pin_hash: 'hash', role: 'admin' },
  })
  assert(dirty?.display_name === 'Ada', 'safe field kept')
  assert(dirty?.password === '[REDACTED]', 'password redacted')
  assert(dirty?.temporary_password === '[REDACTED]', 'temporary_password redacted')
  assert(dirty?.access_token === '[REDACTED]', 'access_token redacted')
  assert(dirty?.refresh_token === '[REDACTED]', 'refresh_token redacted')
  assert(dirty?.token === '[REDACTED]', 'token redacted')
  assert(dirty?.secret === '[REDACTED]', 'secret redacted')
  assert(dirty?.private_key === '[REDACTED]', 'private_key redacted')
  assert(dirty?.service_role_key === '[REDACTED]', 'service_role_key redacted')
  assert(dirty?.SUPABASE_SERVICE_KEY === '[REDACTED]', 'SUPABASE_SERVICE_KEY redacted')
  const nested = dirty?.nested as Record<string, unknown> | undefined
  assert(nested?.pin_hash === '[REDACTED]', 'nested pin_hash redacted')
  assert(nested?.role === 'admin', 'nested safe field kept')

  section('2b. F5 report audit target_id')
  const f5ProjectId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
  const f5ReportNumericId = 9042
  const f5Bind = f5ReportAuditTarget(f5ProjectId)
  assert(f5Bind.targetType === 'f5_report', 'F5 target_type f5_report')
  assert(f5Bind.targetId === f5ProjectId, 'F5 target_id is project UUID')
  assert(validateF5ReportAuditBind(f5ProjectId).ok, 'F5 project bind validates')
  const legacyTarget = validateAuditLogTargetId(String(f5ReportNumericId))
  assert(!legacyTarget.ok, 'numeric report id rejected as target_id')
  assert(
    validateAuditLogTargetId(f5Bind.targetId).ok,
    'F5 bind target_id passes UUID validation'
  )

  section('3. JSON serialization')
  const json = sanitizeAuditValue({
    a: 1,
    b: [true, null, 'x'],
    c: new Date('2026-01-02T00:00:00.000Z'),
  })
  const roundTrip = JSON.parse(JSON.stringify(json))
  assert(roundTrip.a === 1, 'number serializes')
  assert(Array.isArray(roundTrip.b) && roundTrip.b[2] === 'x', 'array serializes')
  assert(roundTrip.c === '2026-01-02T00:00:00.000Z', 'Date → ISO string')

  section('4. Request metadata')
  const headers = new Headers({
    'x-forwarded-for': '203.0.113.10, 10.0.0.1',
    'user-agent': 'AuditValidate/1.0',
  })
  const meta = extractAuditRequestMeta(headers)
  assert(meta.ipAddress === '203.0.113.10', 'x-forwarded-for first hop')
  assert(meta.userAgent === 'AuditValidate/1.0', 'user-agent extracted')
  const empty = extractAuditRequestMeta(null)
  assert(empty.ipAddress === null && empty.userAgent === null, 'null request → null meta')

  section('5. Nullable targets / empty payloads')
  assert(sanitizeAuditRecord(null) === null, 'null record → null')
  assert(sanitizeAuditRecord(undefined) === null, 'undefined record → null')
  assert(sanitizeAuditRecord({}) !== null, 'empty object allowed')

  section('5b. Phase 3 field diffs')
  assert(auditFieldEqual(['b', 'a'], ['a', 'b']), 'visible_states order-insensitive')
  assert(!auditFieldEqual(['a'], ['a', 'b']), 'visible_states length differs')
  const scopeDiff = pickChangedAuditFields(
    {
      partner_id: null,
      err_id: 'room-1',
      can_see_all_states: false,
      visible_states: ['s1'],
      role: 'base_err',
    },
    {
      partner_id: 'p1',
      err_id: null,
      can_see_all_states: false,
      visible_states: [],
      role: 'partner',
    },
    USER_SCOPE_AUDIT_KEYS
  )
  assert(!!scopeDiff, 'scope diff detected')
  assert(scopeDiff?.oldValues.err_id === 'room-1', 'scope old err_id')
  assert(scopeDiff?.newValues.partner_id === 'p1', 'scope new partner_id')
  assert(!('role' in (scopeDiff?.oldValues ?? {})), 'role excluded from scope diff')
  const noDiff = pickChangedAuditFields(
    { display_name: 'Ada' },
    { display_name: 'Ada' },
    ['display_name']
  )
  assert(noDiff === null, 'unchanged fields → null diff')
  const createPayload = sanitizeAuditRecord({
    temporary_password: 'nope',
    display_name: 'Ada',
  })
  assert(
    createPayload?.temporary_password === '[REDACTED]',
    'create payload redacts temp password'
  )

  section('5c. Phase 4 permission override helpers')
  const {
    isManualOverrideReset,
    overridesCount,
    overridesEqual,
    pickOverrideChanges,
  } = await import('../src/lib/permissionManagerAudit')
  assert(isManualOverrideReset([], []), 'empty add/remove is manual reset')
  assert(!isManualOverrideReset(['a'], []), 'non-empty add is not reset')
  assert(
    overridesCount({ add: ['x'], remove: ['y', 'z'] }) === 3,
    'overrides_count sums add+remove'
  )
  assert(
    overridesEqual({ add: ['b', 'a'], remove: [] }, { add: ['a', 'b'], remove: [] }),
    'override equality ignores order'
  )
  const ovDiff = pickOverrideChanges(
    { add: ['a'], remove: [] },
    { add: ['a', 'b'], remove: ['c'] }
  )
  assert(!!ovDiff, 'override diff detected')
  assert(
    Array.isArray(ovDiff?.newValues.add_functions) &&
      (ovDiff?.newValues.add_functions as string[]).includes('b'),
    'new add_functions includes b'
  )
  assert(
    Array.isArray(ovDiff?.newValues.remove_functions) &&
      (ovDiff?.newValues.remove_functions as string[]).includes('c'),
    'new remove_functions includes c'
  )
  assert(
    Object.keys(ovDiff?.oldValues ?? {}).every((k) =>
      ['add_functions', 'remove_functions'].includes(k)
    ),
    'override diff only uses add/remove keys'
  )
  const noOv = pickOverrideChanges(
    { add: ['a'], remove: [] },
    { add: ['a'], remove: [] }
  )
  assert(noOv === null, 'unchanged overrides → null diff')

  section('5d. Phase 6B/6C F1–F5 helpers')
  const { AUDIT_TARGET_TYPES } = await import('../src/lib/auditLog')
  const { pickMouAuditChanges, mouAuditFieldValue } = await import('../src/lib/f123Audit')
  assert(AUDIT_TARGET_TYPES.includes('project'), 'target type project')
  assert(AUDIT_TARGET_TYPES.includes('mou'), 'target type mou')
  assert(AUDIT_TARGET_TYPES.includes('payment_confirmation'), 'target type payment_confirmation')
  assert(AUDIT_TARGET_TYPES.includes('payment_file'), 'target type payment_file')
  assert(AUDIT_TARGET_TYPES.includes('project_document'), 'target type project_document')
  assert(AUDIT_TARGET_TYPES.includes('f4_summary'), 'target type f4_summary')
  assert(AUDIT_TARGET_TYPES.includes('f5_report'), 'target type f5_report')
  assert(
    mouAuditFieldValue('banking_details_override', 'acct-123') === '[PRESENT]',
    'MOU banking content redacted to presence'
  )
  assert(mouAuditFieldValue('partner_name', 'LHUB') === 'LHUB', 'MOU safe field kept')
  const mouDiff = pickMouAuditChanges(
    {
      partner_name: 'A',
      banking_details_override: 'secret-iban',
      start_date: '2026-01-01',
    },
    {
      partner_name: 'B',
      banking_details_override: 'other-iban',
      start_date: '2026-01-01',
    },
    ['partner_name', 'banking_details_override', 'start_date']
  )
  assert(!!mouDiff, 'MOU diff detected')
  assert(mouDiff?.newValues.partner_name === 'B', 'MOU partner_name changed')
  assert(mouDiff?.oldValues.banking_details_override === '[PRESENT]', 'MOU banking old is presence')
  assert(mouDiff?.newValues.banking_details_override === '[PRESENT]', 'MOU banking new is presence')
  assert(!('start_date' in (mouDiff?.oldValues ?? {})), 'unchanged MOU start_date omitted')

  section('5d2. Audit business areas (User Management / Permissions)')
  const { getActionsForAuditArea, resolveEffectiveAuditActions } = await import(
    '../src/lib/auditAreas'
  )
  const { KNOWN_AUDIT_ACTIONS: knownFromLabels } = await import('../src/lib/auditActionLabels')
  assert(
    getActionsForAuditArea('all').length === knownFromLabels.length,
    'all activity includes every known action'
  )
  const um = getActionsForAuditArea('user_management')
  assert(um.length === 6, 'user_management has six actions')
  assert(um.includes('user.created') && um.includes('user.scope_changed'), 'user_management actions')
  assert(!um.includes('user.permission_changed'), 'user_management excludes permissions actions')
  const perm = getActionsForAuditArea('permissions')
  assert(perm.length === 2, 'permissions has two actions')
  assert(perm.includes('user.permission_changed') && perm.includes('user.permissions_reset'), 'permissions actions')
  assert(
    resolveEffectiveAuditActions('user_management', ['user.created', 'user.permission_changed']).length === 1,
    'area ∩ action filter keeps only in-area selection'
  )
  assert(
    resolveEffectiveAuditActions('permissions', ['user.permission_changed', 'user.created']).length === 1,
    'permissions area ∩ action filter'
  )
  assert(
    getActionsForAuditArea('f1').every((a) => a.startsWith('f1.')),
    'f1 area unchanged'
  )
  const f4Area = getActionsForAuditArea('f4')
  assert(f4Area.every((a) => a.startsWith('f4.') || a === 'project.reporting_status_changed' || a === 'project.completed'), 'f4 area action allowlist shape')
  assert(f4Area.includes('f4.report_created'), 'f4 area keeps f4.report_created')
  assert(f4Area.includes('project.reporting_status_changed'), 'f4 area includes reporting status changed')
  assert(f4Area.includes('project.completed'), 'f4 area includes project.completed')
  assert(!f4Area.includes('project.implemented_sector_changed'), 'f4 area excludes other project.*')
  const f5Area = getActionsForAuditArea('f5')
  assert(f5Area.includes('f5.report_created'), 'f5 area keeps f5.report_created')
  assert(f5Area.includes('project.reporting_status_changed'), 'f5 area includes reporting status changed')
  assert(f5Area.includes('project.completed'), 'f5 area includes project.completed')
  assert(
    resolveEffectiveAuditActions('f4', ['project.reporting_status_changed']).join(',') ===
      'project.reporting_status_changed',
    'area f4 ∩ project.reporting_status_changed'
  )

  section('5e. Audit list search classification (Phase 1 perf)')
  const {
    auditSearchPreQueryPlan,
    buildAuditLogSearchOrParts,
    classifyAuditSearchTerm,
    escapeAuditSearchTerm,
    isEmailLikeAuditSearch,
    isGrantBusinessIdentifierToken,
    parseAuditSearchTerm,
    pushGrantIdentifierSearchBranches,
  } = await import('../src/lib/auditLogSearch')
  const sampleUuid = 'a1b2c3d4-e5f6-4178-9abc-def012345678'
  const grantSerial = 'LCC-KF-CB-0626-0009'
  assert(classifyAuditSearchTerm(sampleUuid, escapeAuditSearchTerm(sampleUuid)) === 'uuid', 'uuid class')
  assert(classifyAuditSearchTerm('42', '42') === 'numeric', 'numeric class')
  assert(classifyAuditSearchTerm('a@b.com', 'a@b.com') === 'email', 'full email class')
  assert(isEmailLikeAuditSearch('hamza', 'hamza'), 'partial local-part email-like')
  assert(isEmailLikeAuditSearch('hamza@', 'hamza@'), 'local-part with trailing @')
  assert(isEmailLikeAuditSearch('@example.com', '@example.com'), 'domain with leading @')
  assert(classifyAuditSearchTerm('hamza', 'hamza') === 'email', 'hamza classified email for auth')
  assert(classifyAuditSearchTerm('report', 'report') === 'general', 'report is general not email')
  assert(classifyAuditSearchTerm('payment', 'payment') === 'general', 'payment is general not email')
  assert(classifyAuditSearchTerm('project', 'project') === 'general', 'project is general not email')
  assert(classifyAuditSearchTerm('user', 'user') === 'general', 'user token is general not email')
  assert(classifyAuditSearchTerm('f4', 'f4') === 'general', 'f4 is general not email')
  assert(!isEmailLikeAuditSearch('report', 'report'), 'report not email-like')
  const reportPlan = auditSearchPreQueryPlan('general', 'report')
  assert(reportPlan.authEmail === false && reportPlan.projectGrantId, 'report general uses grant prequery not auth')
  assert(
    classifyAuditSearchTerm(
      'f4.report_created',
      escapeAuditSearchTerm('f4.report_created')
    ) === 'action_like',
    'action_like class'
  )
  assert(classifyAuditSearchTerm('LCC', 'LCC') === 'general', 'LCC is general not email')
  assert(isGrantBusinessIdentifierToken('LCC'), 'LCC is grant token')
  assert(classifyAuditSearchTerm(grantSerial, grantSerial) === 'general', 'full grant serial general')
  const uuidPlan = auditSearchPreQueryPlan('uuid', sampleUuid)
  assert(!uuidPlan.authEmail && !uuidPlan.projectGrantId, 'uuid skips pre-queries')
  const numericPlan = auditSearchPreQueryPlan('numeric', '42')
  assert(!numericPlan.usersDisplayName && !numericPlan.projectGrantId, 'numeric skips user/grant pre-queries')
  const emailPlan = auditSearchPreQueryPlan('email', 'x@y.z')
  assert(emailPlan.authEmail && !emailPlan.projectGrantId, 'email skips grant pre-query')
  const actionPlan = auditSearchPreQueryPlan('action_like', 'f4.report_created')
  assert(!actionPlan.projectGrantId && !actionPlan.authEmail, 'action_like skips user/grant pre-queries')
  const generalPlan = auditSearchPreQueryPlan('general', 'LCC')
  assert(generalPlan.projectGrantId && !generalPlan.authEmail, 'LCC general grant pre-query not auth')
  const uuidOr = buildAuditLogSearchOrParts({
    trimmed: sampleUuid,
    escaped: sampleUuid,
    kind: 'uuid',
    searchUserIds: [],
    searchProjectIds: [],
  })
  assert(uuidOr.length === 3 && !uuidOr.some((p) => p.includes('ilike')), 'uuid OR avoids ILIKE')
  const generalOr: string[] = []
  pushGrantIdentifierSearchBranches(generalOr, 'LCC')
  assert(
    generalOr.some((p) => p.includes('grant_serial') && p.includes('ilike')),
    'grant serial JSON ilike branches'
  )
  const lccOr = buildAuditLogSearchOrParts({
    trimmed: grantSerial,
    escaped: grantSerial,
    kind: 'general',
    searchUserIds: [],
    searchProjectIds: [],
  })
  assert(
    lccOr.some((p) => p.includes('metadata->>grant_serial.ilike')),
    'full grant serial searchable on metadata.grant_serial'
  )
  const parsed = parseAuditSearchTerm('f4.report_created')
  assert(parsed.kind === 'action_like', 'parseAuditSearchTerm')
  assert(parsed.escaped === 'f4.report_created', 'action_like keeps underscores in escaped term')

  section('5e2. Audit action search correctness (Phase 8A)')
  const { escapeAuditActionSearchTerm } = await import('../src/lib/auditLogSearch')
  const { KNOWN_AUDIT_ACTIONS } = await import('../src/lib/auditActionLabels')
  assert(
    escapeAuditSearchTerm('f4.report_created') === 'f4.reportcreated',
    'general escape still strips underscore (classification path)'
  )
  assert(
    escapeAuditActionSearchTerm('f4.report_created') === 'f4.report_created',
    'action escape preserves underscore and dot'
  )
  assert(
    escapeAuditActionSearchTerm('user.role_changed') === 'user.role_changed',
    'action escape preserves user action'
  )

  const phase8aRepresentativeActions = [
    'f1.workplan_created',
    'f1.feedback_submitted',
    'f1.serial_created',
    'f2.committed',
    'f2.project_updated',
    'f3.mou_created',
    'f3.mou_updated',
    'f4.report_created',
    'f4.reviewed',
    'f5.report_created',
    'project.implemented_sector_changed',
    'user.created',
    'user.role_changed',
    'user.permission_changed',
    'project.completed',
    'project.reporting_status_changed',
    'f3.payment_confirmation_created',
  ] as const
  for (const action of phase8aRepresentativeActions) {
    assert(KNOWN_AUDIT_ACTIONS.includes(action), `known action ${action}`)
    const p = parseAuditSearchTerm(action)
    assert(p.kind === 'action_like', `${action} is action_like`)
    assert(p.escaped === action, `${action} escaped preserves identifier`)
    const orParts = buildAuditLogSearchOrParts({
      trimmed: p.trimmed,
      escaped: p.escaped,
      kind: p.kind,
      searchUserIds: [],
      searchProjectIds: [],
    })
    assert(
      orParts.some((part) => part === `action.ilike.%${action}%`),
      `${action} action ILIKE predicate`
    )
  }

  const partialF4 = parseAuditSearchTerm('f4.report')
  assert(partialF4.kind === 'action_like' && partialF4.escaped === 'f4.report', 'partial f4.report')
  const partialOr = buildAuditLogSearchOrParts({
    trimmed: partialF4.trimmed,
    escaped: partialF4.escaped,
    kind: partialF4.kind,
    searchUserIds: [],
    searchProjectIds: [],
  })
  assert(
    partialOr.some((p) => p === 'action.ilike.%f4.report%'),
    'partial action search ILIKE'
  )

  const reportParsed = parseAuditSearchTerm('report')
  assert(reportParsed.kind === 'general' && reportParsed.escaped === 'report', 'report general unchanged')
  const reportOr = buildAuditLogSearchOrParts({
    trimmed: reportParsed.trimmed,
    escaped: reportParsed.escaped,
    kind: reportParsed.kind,
    searchUserIds: [],
    searchProjectIds: [],
  })
  assert(reportOr.some((p) => p === 'action.ilike.%report%'), 'report general action ILIKE unchanged')

  assert(
    resolveEffectiveAuditActions('f4', ['f4.report_created']).join(',') === 'f4.report_created',
    'area f4 ∩ f4.report_created'
  )
  assert(
    resolveEffectiveAuditActions('user_management', ['user.role_changed']).join(',') === 'user.role_changed',
    'area user_management ∩ user.role_changed'
  )
  assert(
    resolveEffectiveAuditActions('permissions', ['user.permission_changed']).join(',') === 'user.permission_changed',
    'area permissions ∩ user.permission_changed'
  )
  assert(
    resolveEffectiveAuditActions('f4', ['user.role_changed']).length === 0,
    'area f4 ∩ unrelated action empty'
  )

  section('5e3. B′ search OR shape (Phase 8B, local/staging flag)')
  const { auditLogSearchBprimeEnabled } = await import('../src/lib/auditLogSearch')
  assert(!auditLogSearchBprimeEnabled(), 'bprime off by default in validation')
  const prevB = process.env.AUDIT_LOG_SEARCH_BPRIME
  process.env.AUDIT_LOG_SEARCH_BPRIME = '1'
  try {
    const bGeneral = buildAuditLogSearchOrParts({
      trimmed: 'LCC',
      escaped: 'LCC',
      kind: 'general',
      searchUserIds: [],
      searchProjectIds: [],
    })
    assert(
      bGeneral.some((p) => p.startsWith('grant_search_text.ilike.')),
      'bprime general uses grant_search_text'
    )
    assert(
      !bGeneral.some((p) => p.includes('metadata->>grant_serial.ilike')),
      'bprime general drops per-field grant JSON ilike'
    )
    const bAction = parseAuditSearchTerm('f4.report_created')
    const bActionOr = buildAuditLogSearchOrParts({
      trimmed: bAction.trimmed,
      escaped: bAction.escaped,
      kind: bAction.kind,
      searchUserIds: [],
      searchProjectIds: [],
    })
    assert(
      bActionOr.some((p) => p === 'action.ilike.%f4.report_created%'),
      'bprime action_like keeps Phase 8A underscore escape'
    )
  } finally {
    if (prevB === undefined) delete process.env.AUDIT_LOG_SEARCH_BPRIME
    else process.env.AUDIT_LOG_SEARCH_BPRIME = prevB
  }

  section('5f. Audit list count optimization (Phase 2A)')
  const { resolveAuditLogListTotalNeed } = await import('../src/lib/auditLogCount')
  const emptyP1 = resolveAuditLogListTotalNeed(1, 25, 0)
  assert(emptyP1.mode === 'derived' && emptyP1.total === 0, 'empty page 1 derived total 0')
  const partialP2 = resolveAuditLogListTotalNeed(2, 25, 5)
  assert(
    partialP2.mode === 'derived' && partialP2.total === 30,
    'partial page 2 derived total 30'
  )
  const fullP1 = resolveAuditLogListTotalNeed(1, 25, 25)
  assert(fullP1.mode === 'needs_db_count', 'full page needs DB count')
  const emptyP3 = resolveAuditLogListTotalNeed(3, 25, 0)
  assert(emptyP3.mode === 'needs_db_count', 'empty page 3 needs DB count')

  section('5g. Audit list keyset pagination (Phase 2B)')
  const {
    buildKeysetCursorOrFilter,
    decodeAuditLogCursor,
    encodeAuditLogCursor,
    isValidAuditLogCursorUuid,
    resolveAuditLogPaginationMode,
  } = await import('../src/lib/auditLogCursor')
  const {
    buildAuditListGeneration,
    getPageFetchCursor,
    mergeNextPageCursor,
    resetStartCursorByPage,
  } = await import('../src/lib/auditLogListPagination')

  const sampleId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde'
  const sampleTs = '2024-06-15T12:30:00.000Z'
  const token = encodeAuditLogCursor(sampleTs, sampleId)
  const decoded = decodeAuditLogCursor(token)
  assert(decoded?.t === sampleTs && decoded?.i === sampleId, 'cursor encode/decode roundtrip')
  assert(decodeAuditLogCursor('not-valid-base64!!!') === null, 'malformed token → null')
  assert(decodeAuditLogCursor('') === null, 'empty token → null')
  assert(isValidAuditLogCursorUuid(sampleId), 'valid sample UUID')
  assert(!isValidAuditLogCursorUuid('not-a-uuid'), 'invalid UUID rejected')
  const badUuidToken = encodeAuditLogCursor(sampleTs, 'not-a-uuid')
  assert(decodeAuditLogCursor(badUuidToken) === null, 'invalid UUID in payload → null')
  const badTsToken = Buffer.from(JSON.stringify({ t: 'not-a-date', i: sampleId }), 'utf8').toString(
    'base64url'
  )
  assert(decodeAuditLogCursor(badTsToken) === null, 'invalid timestamp → null')

  const orFilter = buildKeysetCursorOrFilter(sampleTs, sampleId)
  assert(orFilter.includes('created_at.lt.'), 'keyset OR includes created_at.lt')
  assert(orFilter.includes('id.lt.'), 'keyset OR includes id.lt')
  assert(orFilter.includes('and(created_at.eq.'), 'keyset OR includes tie-break branch')

  assert(resolveAuditLogPaginationMode(1, false) === 'keyset_first_page', 'page 1 no cursor')
  assert(resolveAuditLogPaginationMode(2, true) === 'keyset', 'page 2 with cursor')
  assert(resolveAuditLogPaginationMode(3, true) === 'keyset', 'page 3 with cursor')
  assert(resolveAuditLogPaginationMode(2, false) === 'offset_legacy', 'page 2 missing cursor → OFFSET')

  assert(getPageFetchCursor(1, { 1: null, 2: token }) === null, 'page 1 fetch cursor null')
  assert(getPageFetchCursor(2, { 1: null, 2: token }) === token, 'page 2 uses stored cursor')
  assert(getPageFetchCursor(3, { 1: null, 2: token }) === null, 'page 3 without entry → null')

  const mapAfterP1 = mergeNextPageCursor({ 1: null }, 1, token)
  assert(mapAfterP1[2] === token, 'merge next cursor after page 1')
  const mapAfterPartial = mergeNextPageCursor(mapAfterP1, 2, null)
  assert(mapAfterPartial[3] === undefined, 'no next cursor on partial page')

  const genA = buildAuditListGeneration({
    area: 'f1',
    pageSize: 25,
    search: '',
    actions: ['f1.workplan_created'],
    targetTypes: [],
    actors: [],
    dateFrom: '',
    dateTo: '',
  })
  const genB = buildAuditListGeneration({
    area: 'f1',
    pageSize: 50,
    search: '',
    actions: ['f1.workplan_created'],
    targetTypes: [],
    actors: [],
    dateFrom: '',
    dateTo: '',
  })
  assert(genA !== genB, 'page size change changes list generation')
  const reset = resetStartCursorByPage()
  assert(reset[1] === null && reset[2] === undefined, 'reset cursor map page 1 only')
}

async function runOptionalWrite() {
  section('6. Optional DB write (AUDIT_LOG_VALIDATE_WRITE=1)')
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('  ✗ Missing NEXT_PUBLIC_SUPABASE_URL or service role key')
    failed += 1
    return
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const headers = new Headers({
    'x-forwarded-for': '198.51.100.20',
    'user-agent': 'AuditValidateWrite/1.0',
  })
  const reqMeta = extractAuditRequestMeta(headers)
  const oldValues = sanitizeAuditRecord({
    display_name: 'before',
    password: 'must-not-persist',
  })
  const newValues = sanitizeAuditRecord({ display_name: 'after' })
  const metadata = sanitizeAuditRecord({
    validation: true,
    note: 'phase2 foundation smoke test — safe to delete',
    source: 'system',
  })

  // Mirror logAuditEvent insert path (service role) without Next path aliases.
  const { data: inserted, error: insertErr } = await admin
    .from('audit_logs')
    .insert({
      actor_user_id: null,
      action: 'user.updated',
      target_type: 'user',
      target_id: null,
      old_values: oldValues,
      new_values: newValues,
      metadata,
      ip_address: reqMeta.ipAddress,
      user_agent: reqMeta.userAgent,
    })
    .select('id')
    .single()

  assert(!insertErr && !!inserted?.id, 'service-role insert ok (logAuditEvent path)')
  if (insertErr || !inserted?.id) {
    console.error('  detail:', insertErr?.message || insertErr?.code || JSON.stringify(insertErr))
    console.error(
      '  hint: apply sql/create_audit_logs.sql in Supabase before AUDIT_LOG_VALIDATE_WRITE=1'
    )
    return
  }

  const { data: row, error: readErr } = await admin
    .from('audit_logs')
    .select(
      'id, actor_user_id, action, target_type, target_id, old_values, new_values, metadata, ip_address, user_agent'
    )
    .eq('id', inserted.id)
    .single()

  assert(!readErr && !!row, 'row readable via service role')
  if (!row) return

  assert(row.action === 'user.updated', 'action stored')
  assert(row.actor_user_id === null, 'nullable actor_user_id works')
  assert(row.target_type === 'user', 'target_type stored')
  assert(row.target_id === null, 'nullable target_id works')
  assert(
    (row.old_values as { display_name?: string })?.display_name === 'before',
    'old_values stored'
  )
  assert(
    (row.old_values as { password?: string })?.password === '[REDACTED]',
    'password redacted in DB'
  )
  assert(
    (row.new_values as { display_name?: string })?.display_name === 'after',
    'new_values stored'
  )
  assert(
    String(row.ip_address || '').includes('198.51.100.20'),
    'ip_address stored'
  )
  assert(row.user_agent === 'AuditValidateWrite/1.0', 'user_agent stored')
  assert(
    (row.metadata as { source?: string })?.source === 'system',
    'system source classified (not user seeding)'
  )

  // Authenticated anon/user JWT must not be able to insert (best-effort check)
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (anonKey) {
    const anon = createClient(url, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { error: anonInsertErr } = await anon.from('audit_logs').insert({
      action: 'user.updated',
      metadata: { should: 'fail' },
    })
    assert(!!anonInsertErr, 'anon/authenticated client cannot insert audit_logs')
  }

  const { error: delErr } = await admin.from('audit_logs').delete().eq('id', inserted.id)
  assert(!delErr, 'cleanup delete succeeded')

  const f5ProjectId = 'b2c3d4e5-f6a7-4890-b123-456789abcdef'
  const f5ReportId = 9042
  const f5Bind = f5ReportAuditTarget(f5ProjectId)
  assert(validateAuditLogTargetId(f5Bind.targetId).ok, 'F5 write path target_id UUID ok')
  const f5Metadata = sanitizeAuditRecord({
    source: 'user',
    endpoint: 'POST /api/f5/save',
    project_id: f5ProjectId,
    report_id: f5ReportId,
    validation: true,
    note: 'F5 target_id smoke — safe to delete',
  })
  const { data: f5Inserted, error: f5InsertErr } = await admin
    .from('audit_logs')
    .insert({
      actor_user_id: null,
      action: 'f5.report_created',
      target_type: f5Bind.targetType,
      target_id: f5Bind.targetId,
      old_values: null,
      new_values: sanitizeAuditRecord({ report_id: f5ReportId }),
      metadata: f5Metadata,
      ip_address: reqMeta.ipAddress,
      user_agent: reqMeta.userAgent,
    })
    .select('id, target_type, target_id, metadata')
    .single()

  assert(!f5InsertErr && !!f5Inserted?.id, 'F5 report_created insert with project UUID target_id')
  if (f5Inserted) {
    assert(f5Inserted.target_type === 'f5_report', 'F5 target_type stored')
    assert(f5Inserted.target_id === f5ProjectId, 'F5 target_id stored as project UUID')
    assert(
      (f5Inserted.metadata as { report_id?: number })?.report_id === f5ReportId,
      'F5 metadata.report_id stores numeric report id'
    )
    const { error: f5DelErr } = await admin.from('audit_logs').delete().eq('id', f5Inserted.id)
    assert(!f5DelErr, 'F5 smoke row cleanup delete succeeded')
  }
}

async function main() {
  console.log('Audit Log foundation validation')
  await runOffline()

  if (process.env.AUDIT_LOG_VALIDATE_WRITE === '1') {
    await runOptionalWrite()
  } else {
    console.log(
      '\n(Skipping DB write. Set AUDIT_LOG_VALIDATE_WRITE=1 after applying sql/create_audit_logs.sql)'
    )
  }

  console.log('')
  if (failed > 0) {
    console.error(`FAILED: ${failed} assertion(s)`)
    process.exit(1)
  }
  console.log('PASSED')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
