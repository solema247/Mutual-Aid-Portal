import { getSupabaseRouteClient } from '@/lib/supabaseRouteClient'
import {
  assertMouInGrantAccess,
  assertProjectInGrantAccess,
  getUserGrantAccess,
  type UserGrantAccess,
} from '@/lib/userGrantAccess'

/**
 * Partner signed-URL ownership.
 * Non-partner and anonymous callers are passthrough: the route keeps its
 * existing sign-any-path behavior. A Partner is allowed only after an exact
 * stored-path match and the existing project/MOU grant helpers.
 */
export type StoragePathGrantDecision =
  | { status: 'passthrough' }
  | { status: 'deny' }
  | {
      status: 'allow'
      path: string
      projectId: string | null
      mouId: string | null
    }

type PartnerAccess = Extract<UserGrantAccess, { mode: 'partner' }>

type PathOwner = {
  projectId: string | null
  mouId: string | null
  /** Payment and project files must pass assertProjectInGrantAccess. MOU files use the MOU helper. */
  requireProject: boolean
}

export async function resolveStoragePathGrant (
  path: string,
  bucket: string
): Promise<StoragePathGrantDecision> {
  const access = await getUserGrantAccess()

  if (access.mode === 'all') {
    return { status: 'passthrough' }
  }

  if (access.mode === 'none') {
    // No session and a missing user row share partnerId null with a Partner
    // who has no partner_id. Only the Partner role fails closed.
    if (access.partnerId || (await currentUserIsPartner())) {
      return { status: 'deny' }
    }
    return { status: 'passthrough' }
  }

  if (bucket !== 'images') {
    return { status: 'deny' }
  }

  const owner = await findAuthorizedOwner(path, access)
  if (!owner) {
    return { status: 'deny' }
  }

  return {
    status: 'allow',
    path,
    projectId: owner.projectId,
    mouId: owner.mouId,
  }
}

async function currentUserIsPartner (): Promise<boolean> {
  const supabase = getSupabaseRouteClient()
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError || !session) return false

  const { data, error } = await supabase
    .from('users')
    .select('role')
    .eq('auth_user_id', session.user.id)
    .maybeSingle()
  if (error) {
    // Same outcome as no session: do not turn a users-table blip into a new
    // denial for callers who are not a confirmed Partner.
    console.error('[storagePathGrantAccess] role lookup', error)
    return false
  }
  return data?.role === 'partner'
}

async function findAuthorizedOwner (
  path: string,
  access: PartnerAccess
): Promise<PathOwner | null> {
  const groups = await Promise.all([
    projectColumnOwners('file_key', path),
    projectColumnOwners('temp_file_key', path),
    projectColumnOwners('approval_file_key', path),
    identityDocumentOwners(path),
    projectDocumentOwners(path),
    f4AttachmentOwners(path),
    f5FileOwners(path),
    mouFileOwners('file_key', path),
    mouFileOwners('signed_mou_file_key', path),
    paymentFileOwners(path),
    legacyPaymentOwners(path),
  ])

  let allowed: PathOwner | null = null
  for (const owners of groups) {
    for (const owner of owners) {
      const verdict = await authorizeOwner(access, owner)
      if (verdict === 'deny') return null
      if (!allowed) allowed = owner
    }
  }
  return allowed
}

async function authorizeOwner (
  access: PartnerAccess,
  owner: PathOwner
): Promise<'allow' | 'deny'> {
  if (owner.requireProject) {
    if (!owner.projectId) return 'deny'
    const scope = await assertProjectInGrantAccess(owner.projectId, access)
    if (scope.ok) return 'allow'
    if (scope.response.status >= 500) {
      throw new Error('storage path grant check failed')
    }
    return 'deny'
  }

  if (!owner.mouId) return 'deny'
  const scope = await assertMouInGrantAccess(owner.mouId, access)
  if (scope.ok) return 'allow'
  if (scope.response.status >= 500) {
    throw new Error('storage path grant check failed')
  }
  return 'deny'
}

async function projectColumnOwners (
  column: 'file_key' | 'temp_file_key' | 'approval_file_key',
  path: string
): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  const { data, error } = await supabase
    .from('err_projects')
    .select('id')
    .eq(column, path)
  if (error) throw error
  return (data || []).map((row) => ({
    projectId: row.id,
    mouId: null,
    requireProject: true,
  }))
}

async function identityDocumentOwners (path: string): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  // Column is written by compliance upload but is absent from generated types.
  const { data, error } = await supabase
    .from('err_projects')
    .select('id')
    .eq('identity_document_file_key' as 'file_key', path)
  if (error) throw error
  return (data || []).map((row) => ({
    projectId: row.id,
    mouId: null,
    requireProject: true,
  }))
}

async function projectDocumentOwners (path: string): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  const { data, error } = await supabase
    .from('err_project_documents')
    .select('project_id')
    .eq('file_key', path)
  if (error) throw error
  return (data || []).map((row) => ({
    projectId: row.project_id,
    mouId: null,
    requireProject: true,
  }))
}

async function f4AttachmentOwners (path: string): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  const { data: attachments, error } = await supabase
    .from('err_summary_attachments')
    .select('summary_id')
    .eq('file_key', path)
  if (error) throw error
  if (!attachments?.length) return []

  const summaryIds = [...new Set(attachments.map((row) => row.summary_id))]
  const { data: summaries, error: summaryError } = await supabase
    .from('err_summary')
    .select('id, project_id')
    .in('id', summaryIds)
  if (summaryError) throw summaryError

  const projectBySummary = new Map(
    (summaries || []).map((row) => [row.id, row.project_id])
  )
  return attachments.map((row) => ({
    projectId: projectBySummary.get(row.summary_id) ?? null,
    mouId: null,
    requireProject: true,
  }))
}

async function f5FileOwners (path: string): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  const { data: files, error } = await supabase
    .from('err_program_files')
    .select('report_id')
    .eq('file_url', path)
  if (error) throw error
  if (!files?.length) return []

  const reportIds = [
    ...new Set(files.map((row) => row.report_id).filter((id): id is string => !!id)),
  ]
  const projectByReport = new Map<string, string | null>()
  if (reportIds.length > 0) {
    const { data: reports, error: reportError } = await supabase
      .from('err_program_report')
      .select('id, project_id')
      .in('id', reportIds)
    if (reportError) throw reportError
    for (const row of reports || []) {
      projectByReport.set(row.id, row.project_id)
    }
  }

  return files.map((row) => ({
    projectId: row.report_id ? projectByReport.get(row.report_id) ?? null : null,
    mouId: null,
    requireProject: true,
  }))
}

async function mouFileOwners (
  column: 'file_key' | 'signed_mou_file_key',
  path: string
): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  const { data, error } = await supabase
    .from('mous')
    .select('id')
    .eq(column, path)
  if (error) throw error
  return (data || []).map((row) => ({
    projectId: null,
    mouId: row.id,
    requireProject: false,
  }))
}

async function paymentFileOwners (path: string): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  const { data: files, error } = await supabase
    .from('mou_payment_files')
    .select('payment_confirmation_id')
    .eq('file_path', path)
  if (error) throw error
  if (!files?.length) return []

  const confirmationIds = [...new Set(files.map((row) => row.payment_confirmation_id))]
  const { data: confirmations, error: confirmationError } = await supabase
    .from('mou_payment_confirmations')
    .select('id, project_id, mou_id')
    .in('id', confirmationIds)
  if (confirmationError) throw confirmationError

  const byId = new Map((confirmations || []).map((row) => [row.id, row]))
  return files.map((row) => {
    const confirmation = byId.get(row.payment_confirmation_id)
    return {
      projectId: confirmation?.project_id ?? null,
      mouId: confirmation?.mou_id ?? null,
      requireProject: true,
    }
  })
}

/**
 * Legacy mous.payment_confirmation_file is either one raw path or a JSON map
 * keyed by project id. Authorization uses exact equality only.
 */
async function legacyPaymentOwners (path: string): Promise<PathOwner[]> {
  const supabase = getSupabaseRouteClient()
  const owners: PathOwner[] = []
  const pageSize = 200
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('mous')
      .select('id, payment_confirmation_file')
      .not('payment_confirmation_file', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) throw error

    for (const row of data || []) {
      const raw = row.payment_confirmation_file
      if (!raw) continue
      const hit = matchLegacyPaymentPath(raw, path)
      if (!hit) continue
      if (hit === 'raw') {
        owners.push({
          projectId: await soleProjectIdForMou(row.id),
          mouId: row.id,
          requireProject: true,
        })
        continue
      }
      for (const projectId of hit) {
        owners.push({
          projectId,
          mouId: row.id,
          requireProject: true,
        })
      }
    }

    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return owners
}

function matchLegacyPaymentPath (raw: string, path: string): 'raw' | string[] | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const projectIds: string[] = []
        for (const [projectId, value] of Object.entries(parsed as Record<string, unknown>)) {
          if (typeof value === 'string') {
            if (value === path) projectIds.push(projectId)
            continue
          }
          if (!value || typeof value !== 'object' || Array.isArray(value)) continue
          const filePath = (value as { file_path?: unknown }).file_path
          if (typeof filePath === 'string' && filePath === path) {
            projectIds.push(projectId)
          }
        }
        if (projectIds.length > 0) return projectIds
      }
    } catch {
      // Fall through to an exact raw-string match.
    }
  }

  return trimmed === path ? 'raw' : null
}

async function soleProjectIdForMou (mouId: string): Promise<string | null> {
  const supabase = getSupabaseRouteClient()
  const { data, error } = await supabase
    .from('err_projects')
    .select('id')
    .eq('mou_id', mouId)
    .limit(2)
  if (error) throw error
  if (!data || data.length !== 1) return null
  return data[0].id
}
