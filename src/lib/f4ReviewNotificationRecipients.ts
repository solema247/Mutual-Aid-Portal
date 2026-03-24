import type { SupabaseClient } from '@supabase/supabase-js'
import { can, type PermissionUser } from '@/lib/permissions'
import { getOverridesMap } from '@/lib/userOverridesDb'

const FINANCE_FUNCTIONS = ['f4_review', 'f4_fetch_by_serial']

export interface F4ReviewRecipientsResult {
  userIds: string[]
  errName: string | null
  projectId: string | null
}

/**
 * Resolve recipient user ids for F4 review (Accept/Reject) notifications:
 * F4 uploader, finance team (f4_review or f4_fetch_by_serial), responsible ERR users.
 */
export async function getF4ReviewNotificationRecipients(
  supabase: SupabaseClient,
  summaryId: number
): Promise<F4ReviewRecipientsResult> {
  const userIds = new Set<string>()
  let errName: string | null = null
  let projectId: string | null = null

  const { data: summary } = await supabase
    .from('err_summary')
    .select('project_id')
    .eq('id', summaryId)
    .single()

  if (!summary?.project_id) {
    // No project (e.g. historical); still try F4 uploader and finance team
  } else {
    projectId = summary.project_id
    const { data: project } = await supabase
      .from('err_projects')
      .select('emergency_room_id, emergency_rooms (name, name_ar, err_code)')
      .eq('id', summary.project_id)
      .single()
    if (project?.emergency_room_id) {
      errName =
        (project as any).emergency_rooms?.name ||
        (project as any).emergency_rooms?.name_ar ||
        (project as any).emergency_rooms?.err_code ||
        null
      const { data: errUsers } = await supabase
        .from('users')
        .select('id')
        .eq('err_id', project.emergency_room_id)
        .eq('status', 'active')
      for (const u of errUsers || []) userIds.add((u as any).id)
    }
  }

  const [{ data: atts }, { data: expRows }] = await Promise.all([
    supabase.from('err_summary_attachments').select('uploaded_by').eq('summary_id', summaryId),
    supabase.from('err_expense').select('uploaded_by').eq('summary_id', summaryId)
  ])
  for (const r of atts || []) {
    const uid = (r as any).uploaded_by
    if (uid) userIds.add(uid)
  }
  for (const r of expRows || []) {
    const uid = (r as any).uploaded_by
    if (uid) userIds.add(uid)
  }

  const { data: activeUsers } = await supabase
    .from('users')
    .select('id, role')
    .eq('status', 'active')
  const users = activeUsers || []
  const overridesMap = await getOverridesMap(
    supabase,
    users.map((u: any) => u.id)
  )
  for (const u of users) {
    const permUser: PermissionUser = { id: u.id, role: u.role }
    if (FINANCE_FUNCTIONS.some((code) => can(permUser, code, overridesMap))) userIds.add(u.id)
  }

  return { userIds: Array.from(userIds), errName, projectId }
}
