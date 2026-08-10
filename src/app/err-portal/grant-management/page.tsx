import { redirect } from 'next/navigation'

/** Legacy URL — Grant Management now lives under subpages. */
export default function GrantManagementIndexPage() {
  redirect('/err-portal/grant-management/decisions')
}
