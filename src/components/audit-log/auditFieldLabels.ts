/** Client-safe audit detail field labels (i18n keys). */

export type AuditDetailTranslate = (
  key: string,
  opts?: Record<string, unknown>
) => string

const FIELD_I18N: Record<string, string> = {
  role: 'audit:field_role',
  status: 'audit:field_status',
  display_name: 'audit:field_display_name',
  partner_id: 'audit:field_partner_id',
  err_id: 'audit:field_err_id',
  can_see_all_states: 'audit:field_can_see_all_states',
  visible_states: 'audit:field_visible_states',
  add_functions: 'audit:field_add_functions',
  remove_functions: 'audit:field_remove_functions',
  function_codes: 'audit:field_function_codes',
  reason: 'audit:field_reason',
  overrides_cleared: 'audit:field_overrides_cleared',
  overrides_count: 'audit:field_overrides_count',
  project_id: 'audit:field_project_id',
  summary_id: 'audit:field_summary_id',
  report_id: 'audit:field_report_id',
  mou_id: 'audit:field_mou_id',
  expenses: 'audit:field_expenses',
  planned_activities: 'audit:field_planned_activities',
  expense_activity: 'audit:field_expense_activity',
  expense_description: 'audit:field_expense_description',
  expense_amount: 'audit:field_expense_amount',
  expense_amount_sdg: 'audit:field_expense_amount_sdg',
  activity_name: 'audit:field_activity_name',
  activity_goal: 'audit:field_activity_goal',
}

export function auditFieldLabel(key: string, t: AuditDetailTranslate): string {
  const i18nKey = FIELD_I18N[key]
  if (i18nKey) return t(i18nKey, { defaultValue: key.replace(/_/g, ' ') })
  return key.replace(/_/g, ' ')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** One-line summary for table rows — never uses Object.prototype.toString on objects. */
export function summarizeAuditFieldValue(value: unknown, t: AuditDetailTranslate): string {
  if (value == null) return ''
  if (typeof value === 'boolean') {
    return value ? t('audit:yes', { defaultValue: 'Yes' }) : t('audit:no', { defaultValue: 'No' })
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return t('audit:summary_empty_list', { defaultValue: '(empty)' })
    const hasObjects = value.some(isRecord)
    if (hasObjects) {
      return t('audit:summary_item_count', {
        count: value.length,
        defaultValue: `${value.length} items`,
      })
    }
    return value.map(String).join(', ')
  }
  if (isRecord(value)) {
    return t('audit:summary_object', { defaultValue: '(object)' })
  }
  const s = String(value)
  return s.length > 48 ? `${s.slice(0, 45)}…` : s
}
