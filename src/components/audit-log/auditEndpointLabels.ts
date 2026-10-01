import type { AuditDetailTranslate } from './auditFieldLabels'

const EXACT_ENDPOINTS: Record<string, { i18nKey: string; fallback: string }> = {
  'PATCH /api/f2/projects/[id]/editor': {
    i18nKey: 'audit:endpoint_project_editor',
    fallback: 'Project Editor',
  },
  'POST /api/f4/update': { i18nKey: 'audit:endpoint_f4_update', fallback: 'F4 Report Update' },
  'POST /api/f4/save': { i18nKey: 'audit:endpoint_f4_save', fallback: 'F4 Report Save' },
  'POST /api/f5/update': { i18nKey: 'audit:endpoint_f5_update', fallback: 'F5 Report Update' },
  'POST /api/f5/save': { i18nKey: 'audit:endpoint_f5_save', fallback: 'F5 Report Save' },
  'PATCH /api/projects/[id]/reporting-status': {
    i18nKey: 'audit:endpoint_reporting_status',
    fallback: 'Reporting Status',
  },
  'PATCH /api/projects/[id]/status': {
    i18nKey: 'audit:endpoint_project_status',
    fallback: 'Project Status',
  },
  'PATCH /api/projects/[id]/implemented-sector': {
    i18nKey: 'audit:endpoint_implemented_sector',
    fallback: 'Implemented Sector',
  },
}

export function getAuditEndpointFriendlyLabel(
  endpoint: string | null | undefined,
  t: AuditDetailTranslate
): string {
  if (!endpoint) return t('audit:details_empty', { defaultValue: '—' })
  const exact = EXACT_ENDPOINTS[endpoint]
  if (exact) return t(exact.i18nKey, { defaultValue: exact.fallback })
  if (endpoint.includes('/payment-confirmation')) {
    return t('audit:endpoint_payment_confirmation', {
      defaultValue: 'Payment Confirmation',
    })
  }
  if (endpoint.includes('/mous/')) {
    return t('audit:endpoint_mou', { defaultValue: 'MOU' })
  }
  return endpoint
}

export function endpointShowsRawSecondary(
  endpoint: string | null | undefined,
  friendly: string
): boolean {
  return Boolean(endpoint && friendly !== endpoint)
}
