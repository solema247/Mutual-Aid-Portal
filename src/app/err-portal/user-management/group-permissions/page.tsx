import { redirect } from 'next/navigation'

/** Bulk permissions retired — use the Permissions page (type defaults + exceptions). */
export default function GroupPermissionsRedirectPage() {
  redirect('/err-portal/user-management/permissions')
}
