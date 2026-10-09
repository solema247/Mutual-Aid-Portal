import type { SupabaseClient } from '@supabase/supabase-js'
import {
  FULL_PORTAL_MOUNT_CODES,
  type ResolvedCanvasContext,
} from '@/lib/canvas/types'

/**
 * When canvas tables are missing or membership cannot be loaded, fail closed:
 * no org identity, no mounts. Callers must not treat this as portal-wide access.
 */
function canvasUnavailableFallback(): ResolvedCanvasContext {
  return {
    organization: {
      id: '',
      slug: '',
      name: '',
      org_type: 'processor',
      is_default_owner: false,
    },
    environment: {
      id: '',
      slug: '',
      display_name: 'Portal',
      logo_url: null,
      header_title: 'Portal',
      organization_id: '',
    },
    mounted_modules: [],
    is_fallback: true,
  }
}

export type ResolveEnvironmentOptions = {
  /** When true (support role), return full mount catalog for the resolved env. */
  bypassMountGating?: boolean
}

/**
 * Resolve the user's default canvas environment + mounted modules from the DB.
 * Pass bypassMountGating for support only — not superadmin.
 */
export async function resolveEnvironmentForUser(
  supabase: SupabaseClient,
  userId: string,
  options?: ResolveEnvironmentOptions
): Promise<ResolvedCanvasContext> {
  try {
    const { data: membership, error: memErr } = await supabase
      .from('organization_memberships')
      .select(
        `
        is_default,
        organization_id,
        environment_id,
        organizations:organization_id ( id, slug, name, org_type, is_default_owner ),
        environments:environment_id (
          id, slug, display_name, logo_url, header_title, organization_id
        )
      `
      )
      .eq('user_id', userId)
      .order('is_default', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (memErr) {
      console.warn('[canvas] resolveEnvironment membership error:', memErr.message)
      return canvasUnavailableFallback()
    }

    if (!membership) {
      return canvasUnavailableFallback()
    }

    const orgRaw = membership.organizations as unknown
    const envRaw = membership.environments as unknown
    const org = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as {
      id: string
      slug: string
      name: string
      org_type: string
      is_default_owner?: boolean | null
    } | null
    const env = (Array.isArray(envRaw) ? envRaw[0] : envRaw) as {
      id: string
      slug: string
      display_name: string
      logo_url: string | null
      header_title: string | null
      organization_id: string
    } | null

    if (!org || !env) {
      return canvasUnavailableFallback()
    }

    let mounted_modules: string[]

    if (options?.bypassMountGating) {
      const { data: catalog, error: catErr } = await supabase
        .from('mount_catalog')
        .select('code')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
      if (catErr || !catalog?.length) {
        mounted_modules = [...FULL_PORTAL_MOUNT_CODES]
      } else {
        mounted_modules = catalog.map((r) => r.code as string)
      }
    } else {
      const { data: mounts, error: mountErr } = await supabase
        .from('environment_mounts')
        .select('mount_code, sort_order')
        .eq('environment_id', env.id)
        .order('sort_order', { ascending: true })

      if (mountErr) {
        console.warn('[canvas] resolveEnvironment mounts error:', mountErr.message)
        return canvasUnavailableFallback()
      }

      mounted_modules = (mounts ?? []).map((m) => m.mount_code as string)
    }

    return {
      organization: {
        id: org.id,
        slug: org.slug,
        name: org.name,
        org_type: org.org_type as ResolvedCanvasContext['organization']['org_type'],
        is_default_owner: org.is_default_owner === true,
      },
      environment: {
        id: env.id,
        slug: env.slug,
        display_name: env.display_name,
        logo_url: env.logo_url,
        header_title: env.header_title,
        organization_id: env.organization_id,
      },
      mounted_modules,
      is_fallback: false,
    }
  } catch (err) {
    console.warn('[canvas] resolveEnvironment unexpected error:', err)
    return canvasUnavailableFallback()
  }
}
