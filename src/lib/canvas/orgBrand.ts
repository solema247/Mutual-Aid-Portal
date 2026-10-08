/**
 * Brand-specific UI (loaders, page transitions) keyed by organization slug.
 * Pipeline tenancy still uses is_default_owner; branding uses the stable slug.
 */
export const LOCALIZATION_HUB_ORG_SLUG = 'localization_hub'

export function isLocalizationHubOrg(
  organizationSlug: string | null | undefined,
): boolean {
  return organizationSlug === LOCALIZATION_HUB_ORG_SLUG
}
