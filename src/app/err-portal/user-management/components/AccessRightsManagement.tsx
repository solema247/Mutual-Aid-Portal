'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ActiveUserListItem, User } from '@/app/api/users/types/users'
import { getActiveUsers } from '@/app/api/users/utils/users'
import { supabase } from '@/lib/supabaseClient'
import {
  SmartFilter,
  getUserManagementFilterFields,
  type ActiveFilter,
} from '@/components/smart-filter'
import {
  Check,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Search,
  Shield,
  Trash2,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import EditUserDialog from './EditUserDialog'
import DeleteUserDialog from './DeleteUserDialog'
import StatusConfirmDialog from './StatusConfirmDialog'

type PortalRole =
  | 'support'
  | 'superadmin'
  | 'admin'
  | 'state_err'
  | 'base_err'
  | 'partner'

interface State {
  id: string
  state_name: string
  state_name_ar: string | null
}

interface PartnerOption {
  id: string
  name: string
}

interface ErrOption {
  id: string
  name: string
}

interface SummaryCounts {
  total: number
  active: number
  suspended: number
  baseErr: number
}

interface AccessRightsManagementProps {
  currentUserRole: string
  currentUserErrId: string | null
  currentUserId?: string
}

const DEFAULT_PAGE_SIZE = 25
const PAGE_SIZE_OPTIONS = [25, 50, 100] as const

function getMultiFilterValues(filters: ActiveFilter[], fieldId: string): string[] {
  const match = filters.find((f) => f.fieldId === fieldId)
  if (!match || match.value == null) return []
  if (Array.isArray(match.value)) {
    return match.value.map((v) => String(v).trim()).filter(Boolean)
  }
  const trimmed = String(match.value).trim()
  return trimmed ? [trimmed] : []
}

function roleLabel(
  role: string,
  t: (key: string, opts?: Record<string, string>) => string
): string {
  switch (role) {
    case 'support':
      return t('users:support_role')
    case 'superadmin':
      return t('users:superadmin_role')
    case 'admin':
      return t('users:admin_role')
    case 'state_err':
      return t('users:state_err_role')
    case 'base_err':
      return t('users:base_err_role')
    case 'partner':
      return t('users:partner_role', { defaultValue: 'Partner' })
    default:
      return role
  }
}

function getInitials(name: string | null | undefined): string {
  if (!name?.trim()) return '?'
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function stateNamesForUser(
  user: ActiveUserListItem,
  states: State[]
): string[] {
  const ids = user.visible_states || []
  return ids
    .map((id) => states.find((s) => s.id === id)?.state_name)
    .filter((n): n is string => Boolean(n))
}

function getAccessScopeParts(
  user: ActiveUserListItem,
  states: State[],
  partnerNameById: Map<string, string>,
  t: (key: string, opts?: Record<string, string>) => string
): { label: string; details: string[] } {
  if (user.role === 'partner') {
    const name = user.partner_id ? partnerNameById.get(user.partner_id) : null
    return { label: name || '—', details: name ? [name] : [] }
  }

  if (user.role === 'base_err') {
    const name = user.err_name && user.err_name !== '-' ? user.err_name : null
    return { label: name || '—', details: name ? [name] : [] }
  }

  if (user.role === 'state_err') {
    if (user.can_see_all_states) {
      const all = t('users:scope_all_states', { defaultValue: 'All States' })
      return { label: all, details: [all] }
    }
    const names = stateNamesForUser(user, states)
    if (names.length > 0) {
      if (names.length === 1) return { label: names[0], details: names }
      return {
        label: t('users:states_count', {
          defaultValue: '{{count}} states',
          count: names.length,
        }),
        details: names,
      }
    }
    if (user.state_name && user.state_name !== '-') {
      return { label: user.state_name, details: [user.state_name] }
    }
    return { label: '—', details: [] }
  }

  if (user.can_see_all_states !== false) {
    const all = t('users:scope_all_states', { defaultValue: 'All States' })
    return { label: all, details: [all] }
  }
  const names = stateNamesForUser(user, states)
  if (names.length > 1) {
    return {
      label: t('users:states_count', {
        defaultValue: '{{count}} states',
        count: names.length,
      }),
      details: names,
    }
  }
  if (names.length === 1) return { label: names[0], details: names }
  const all = t('users:scope_all_states', { defaultValue: 'All States' })
  return { label: all, details: [all] }
}

function getAccessScopeLabel(
  user: ActiveUserListItem,
  states: State[],
  partnerNameById: Map<string, string>,
  t: (key: string, opts?: Record<string, string>) => string
): string {
  return getAccessScopeParts(user, states, partnerNameById, t).label
}

function buildPageNumbers(current: number, total: number): Array<number | 'ellipsis'> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1)
  }
  const pages: Array<number | 'ellipsis'> = [1]
  const start = Math.max(2, current - 1)
  const end = Math.min(total - 1, current + 1)
  if (start > 2) pages.push('ellipsis')
  for (let p = start; p <= end; p += 1) pages.push(p)
  if (end < total - 1) pages.push('ellipsis')
  pages.push(total)
  return pages
}

export default function AccessRightsManagement({
  currentUserRole,
  currentUserErrId,
  currentUserId,
}: AccessRightsManagementProps) {
  const { t } = useTranslation(['users', 'common'])
  const [users, setUsers] = useState<ActiveUserListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [totalUsers, setTotalUsers] = useState(0)
  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [states, setStates] = useState<State[]>([])
  const [partners, setPartners] = useState<PartnerOption[]>([])
  const [errOptions, setErrOptions] = useState<ErrOption[]>([])
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const [pendingPartnerRoleUserIds, setPendingPartnerRoleUserIds] = useState<Set<string>>(
    () => new Set()
  )
  const [detailsUserId, setDetailsUserId] = useState<string | null>(null)
  const [accessEditUserId, setAccessEditUserId] = useState<string | null>(null)
  const [editUserId, setEditUserId] = useState<string | null>(null)
  const [deleteUserId, setDeleteUserId] = useState<string | null>(null)
  const [statusConfirmUserId, setStatusConfirmUserId] = useState<string | null>(null)
  const [actionsOpenId, setActionsOpenId] = useState<string | null>(null)
  const [summary, setSummary] = useState<SummaryCounts>({
    total: 0,
    active: 0,
    suspended: 0,
    baseErr: 0,
  })

  const selectedRoles = useMemo(
    () => getMultiFilterValues(filters, 'role') as PortalRole[],
    [filters]
  )
  const selectedStatuses = useMemo(
    () => getMultiFilterValues(filters, 'status') as Array<'active' | 'suspended'>,
    [filters]
  )
  const selectedScopes = useMemo(
    () => getMultiFilterValues(filters, 'scope'),
    [filters]
  )
  const selectedStates = useMemo(
    () => getMultiFilterValues(filters, 'state'),
    [filters]
  )
  const selectedErrIds = useMemo(
    () => getMultiFilterValues(filters, 'err'),
    [filters]
  )
  const selectedPartnerIds = useMemo(
    () => getMultiFilterValues(filters, 'partner'),
    [filters]
  )

  // Debounced search for server-side queries
  const [debouncedSearch, setDebouncedSearch] = useState(searchQuery)
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Hydrate search / page / pageSize from URL once
  const urlHydratedRef = useRef(false)
  useEffect(() => {
    if (urlHydratedRef.current || typeof window === 'undefined') return
    urlHydratedRef.current = true
    const params = new URLSearchParams(window.location.search)
    const q = params.get('um_q')
    const page = Number(params.get('um_page') || '')
    const size = Number(params.get('um_size') || '')
    if (q) setSearchQuery(q)
    if (Number.isFinite(page) && page >= 1) setCurrentPage(page)
    if (PAGE_SIZE_OPTIONS.includes(size as (typeof PAGE_SIZE_OPTIONS)[number])) {
      setPageSize(size)
    }
  }, [])

  // Persist search / page / pageSize in URL alongside SmartFilter um_* params
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    let changed = false
    const nextQ = debouncedSearch.trim()
    if (nextQ) {
      if (params.get('um_q') !== nextQ) {
        params.set('um_q', nextQ)
        changed = true
      }
    } else if (params.has('um_q')) {
      params.delete('um_q')
      changed = true
    }
    if (params.get('um_page') !== String(currentPage)) {
      params.set('um_page', String(currentPage))
      changed = true
    }
    if (params.get('um_size') !== String(pageSize)) {
      params.set('um_size', String(pageSize))
      changed = true
    }
    if (changed) {
      const url = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}`
      window.history.replaceState(null, '', url)
    }
  }, [debouncedSearch, currentPage, pageSize])

  useEffect(() => {
    const fetchStates = async () => {
      try {
        const res = await fetch('/api/states')
        if (!res.ok) throw new Error('Failed to fetch states')
        const data = await res.json()
        setStates(data)
      } catch (err) {
        console.error('Error fetching states:', err)
      }
    }
    fetchStates()
  }, [])

  useEffect(() => {
    const fetchPartners = async () => {
      try {
        const { data, error: partnersError } = await supabase
          .from('partners')
          .select('id, name')
          .eq('status', 'active')
          .order('name')
        if (partnersError) throw partnersError
        setPartners((data || []) as PartnerOption[])
      } catch (err) {
        console.error('Error fetching partners:', err)
      }
    }
    fetchPartners()
  }, [])

  useEffect(() => {
    const fetchErrs = async () => {
      try {
        const { data, error: errError } = await supabase
          .from('emergency_rooms')
          .select('id, name')
          .order('name')
        if (errError) throw errError
        setErrOptions((data || []) as ErrOption[])
      } catch (err) {
        console.error('Error fetching emergency rooms:', err)
      }
    }
    fetchErrs()
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const base = {
        page: 1,
        pageSize: 1,
        sortOrder: 'desc' as const,
        currentUserRole,
        currentUserErrId,
      }
      const [totalRes, activeRes, suspendedRes, baseErrRes] = await Promise.all([
        getActiveUsers({ ...base, status: 'all' }),
        getActiveUsers({ ...base, status: 'active' }),
        getActiveUsers({ ...base, status: 'suspended' }),
        getActiveUsers({ ...base, status: 'all', role: 'base_err' }),
      ])
      setSummary({
        total: totalRes.total,
        active: activeRes.total,
        suspended: suspendedRes.total,
        baseErr: baseErrRes.total,
      })
    } catch (err) {
      console.error('Error fetching user summary:', err)
    }
  }, [currentUserRole, currentUserErrId])

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const { users: fetchedUsers, total } = await getActiveUsers({
        page: currentPage,
        pageSize,
        roles: selectedRoles.length > 0 ? selectedRoles : undefined,
        statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
        status: 'all',
        sortOrder: 'desc',
        currentUserRole,
        currentUserErrId,
        stateFilters: selectedStates.length > 0 ? selectedStates : undefined,
        search: debouncedSearch.trim() || undefined,
        scopes: selectedScopes.length > 0 ? selectedScopes : undefined,
        errIds: selectedErrIds.length > 0 ? selectedErrIds : undefined,
        partnerIds: selectedPartnerIds.length > 0 ? selectedPartnerIds : undefined,
      })

      const formattedUsers: ActiveUserListItem[] = fetchedUsers
        .filter((user) => currentUserRole === 'support' || user.role !== 'support')
        .map((user) => ({
          id: user.id,
          err_id: user.err_id,
          partner_id: (user as { partner_id?: string | null }).partner_id ?? null,
          display_name: user.display_name,
          role: user.role as PortalRole,
          status: user.status as 'active' | 'suspended',
          createdAt: new Date(user.created_at || '').toLocaleDateString(),
          updatedAt: user.updated_at ? new Date(user.updated_at).toLocaleDateString() : null,
          err_name: user.emergency_rooms?.name || '-',
          err_code: user.emergency_rooms?.err_code || '-',
          state_name: user.emergency_rooms?.state?.state_name || '-',
          can_see_all_states: user.can_see_all_states ?? true,
          visible_states: user.visible_states || [],
          email: (user as User & { email?: string | null }).email ?? null,
        }))

      setUsers(formattedUsers)
      const supportCount =
        currentUserRole === 'support'
          ? 0
          : fetchedUsers.filter((u) => u.role === 'support').length
      setTotalUsers(Math.max(0, total - supportCount))
      setPendingPartnerRoleUserIds(new Set())
    } catch (err) {
      setError(t('common:error_fetching_data'))
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [
    currentPage,
    pageSize,
    selectedRoles,
    selectedStatuses,
    selectedStates,
    selectedScopes,
    selectedErrIds,
    selectedPartnerIds,
    debouncedSearch,
    currentUserRole,
    currentUserErrId,
    t,
  ])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  // Reset to page 1 after filters change (skip initial hydrate window)
  const allowPageResetRef = useRef(false)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      allowPageResetRef.current = true
    }, 600)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    if (!allowPageResetRef.current) return
    setCurrentPage(1)
  }, [
    selectedRoles,
    selectedStatuses,
    selectedStates,
    selectedScopes,
    selectedErrIds,
    selectedPartnerIds,
    debouncedSearch,
    pageSize,
  ])

  const partnerNameById = useMemo(
    () => new Map(partners.map((p) => [p.id, p.name])),
    [partners]
  )

  const filterFields = useMemo(
    () =>
      getUserManagementFilterFields({
        stateOptions: states.map((s) => ({ value: s.state_name, label: s.state_name })),
        errOptions: errOptions.map((e) => ({ value: e.id, label: e.name })),
        partnerOptions: partners.map((p) => ({ value: p.id, label: p.name })),
        roleOptions: [
          { value: 'admin', label: t('users:admin_role') },
          { value: 'superadmin', label: t('users:superadmin_role') },
          { value: 'support', label: t('users:support_role') },
          { value: 'state_err', label: t('users:state_err_role') },
          { value: 'base_err', label: t('users:base_err_role') },
          { value: 'partner', label: t('users:partner_role', { defaultValue: 'Partner' }) },
        ],
        labels: {
          role: t('users:role'),
          status: t('users:status'),
          scope: t('users:filter_by_scope', { defaultValue: 'Scope' }),
          state: t('users:state'),
          errRoom: t('users:err_room_filter', { defaultValue: 'ERR / Room' }),
          partner: t('users:partner_org', { defaultValue: 'Partner' }),
          active: t('users:active_status'),
          suspended: t('users:suspended_status'),
          allStates: t('users:scope_all_states', { defaultValue: 'All States' }),
          stateScope: t('users:scope_state', { defaultValue: 'State' }),
          emergencyRoom: t('users:scope_emergency_room', { defaultValue: 'Emergency Room' }),
          partnerGrant: t('users:scope_partner_grant', { defaultValue: 'Partner / Grant' }),
          noState: t('users:no_state', { defaultValue: 'No State' }),
        },
      }),
    [states, errOptions, partners, t]
  )

  // Server already filtered; display the current page as-is
  const filteredUsers = users
  const detailsUser = detailsUserId
    ? users.find((u) => u.id === detailsUserId) || null
    : null
  const accessEditUser = accessEditUserId
    ? users.find((u) => u.id === accessEditUserId) || null
    : null
  const editUser = editUserId ? users.find((u) => u.id === editUserId) || null : null
  const deleteUser = deleteUserId
    ? users.find((u) => u.id === deleteUserId) || null
    : null
  const statusConfirmUser = statusConfirmUserId
    ? users.find((u) => u.id === statusConfirmUserId) || null
    : null

  const showSuccess = (message: string) => {
    setSuccessMessage(message)
    setTimeout(() => setSuccessMessage(null), 4000)
  }

  const refreshAfterMutation = async () => {
    await Promise.all([fetchUsers(), fetchSummary()])
  }

  const openEditUser = (userId: string) => {
    setActionsOpenId(null)
    setDetailsUserId(null)
    setEditUserId(userId)
  }

  const openDeleteUser = (userId: string) => {
    setActionsOpenId(null)
    setDetailsUserId(null)
    setDeleteUserId(userId)
  }

  const openStatusConfirm = (userId: string) => {
    setActionsOpenId(null)
    setDetailsUserId(null)
    setStatusConfirmUserId(userId)
  }

  const handleRoleChange = async (userId: string, newRole: PortalRole) => {
    if (newRole === 'partner') {
      setPendingPartnerRoleUserIds((prev) => new Set(prev).add(userId))
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, role: 'partner', partner_id: u.partner_id } : u))
      )
      return
    }

    try {
      setSavingUserId(userId)
      setPendingPartnerRoleUserIds((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
      const res = await fetch(`/api/users/${userId}/access-rights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update role')
      }

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('portal-user-role-changed', { detail: { userId } }))
      }
      await fetchUsers()
      await fetchSummary()
    } catch (error: unknown) {
      console.error('Error updating role:', error)
      setError(error instanceof Error ? error.message : t('common:error_updating_user'))
      setTimeout(() => setError(null), 5000)
      await fetchUsers()
    } finally {
      setSavingUserId(null)
    }
  }

  const handlePartnerOrgChange = async (userId: string, partnerId: string) => {
    if (!partnerId) return
    try {
      setSavingUserId(userId)
      const body: { partner_id: string; role?: 'partner' } = { partner_id: partnerId }
      const user = users.find((u) => u.id === userId)
      if (user?.role !== 'partner' || pendingPartnerRoleUserIds.has(userId)) {
        body.role = 'partner'
      }

      const res = await fetch(`/api/users/${userId}/access-rights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update partner organization')
      }

      if (body.role && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('portal-user-role-changed', { detail: { userId } }))
      }
      setPendingPartnerRoleUserIds((prev) => {
        const next = new Set(prev)
        next.delete(userId)
        return next
      })
      await fetchUsers()
      await fetchSummary()
    } catch (error: unknown) {
      console.error('Error updating partner organization:', error)
      setError(error instanceof Error ? error.message : t('common:error_updating_user'))
      setTimeout(() => setError(null), 5000)
    } finally {
      setSavingUserId(null)
    }
  }

  const handleAccessRightsChange = async (
    userId: string,
    canSeeAllStates: boolean,
    visibleStates: string[],
    userRole: string
  ) => {
    if (userRole === 'partner') {
      setError('Partner users do not use state access controls')
      setTimeout(() => setError(null), 5000)
      return
    }

    if (userRole === 'admin' && currentUserRole !== 'superadmin' && currentUserRole !== 'support') {
      setError('Only superadmin or support can change state access for admin users')
      setTimeout(() => setError(null), 5000)
      return
    }

    try {
      setSavingUserId(userId)
      const res = await fetch(`/api/users/${userId}/access-rights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          can_see_all_states: canSeeAllStates,
          visible_states: canSeeAllStates ? [] : visibleStates,
        }),
      })

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to update access rights')
      }

      await fetchUsers()
    } catch (error: unknown) {
      console.error('Error updating access rights:', error)
      setError(error instanceof Error ? error.message : t('common:error_updating_user'))
      setTimeout(() => setError(null), 5000)
    } finally {
      setSavingUserId(null)
    }
  }

  const totalPages = Math.max(1, Math.ceil(totalUsers / pageSize))
  const pageNumbers = buildPageNumbers(currentPage, totalPages)
  const showingFrom = totalUsers === 0 ? 0 : (currentPage - 1) * pageSize + 1
  const showingTo = Math.min(currentPage * pageSize, totalUsers)

  const openAccessRights = (userId: string) => {
    setActionsOpenId(null)
    setDetailsUserId(null)
    setAccessEditUserId(userId)
  }

  const renderStatus = (status: 'active' | 'suspended') => (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium',
        status === 'active'
          ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'bg-rose-500/10 text-rose-700 dark:text-rose-400'
      )}
    >
      {status === 'active' ? (
        <Check className="size-3 shrink-0" aria-hidden />
      ) : (
        <X className="size-3 shrink-0" aria-hidden />
      )}
      {t(`users:${status}_status`)}
    </span>
  )

  const renderScopeDetails = (user: ActiveUserListItem) => {
    if (user.role === 'partner') {
      const name = user.partner_id ? partnerNameById.get(user.partner_id) : null
      return (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {t('users:partner_org', { defaultValue: 'Partner' })}
          </div>
          <div className="text-sm">{name || '—'}</div>
        </div>
      )
    }
    if (user.role === 'base_err') {
      return (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {t('users:err_name')}
          </div>
          <div className="text-sm">
            {user.err_name && user.err_name !== '-' ? user.err_name : '—'}
          </div>
        </div>
      )
    }
    if (user.role === 'state_err') {
      const names =
        user.can_see_all_states
          ? [t('users:scope_all_states', { defaultValue: 'All States' })]
          : stateNamesForUser(user, states)
      const fallback =
        names.length === 0 && user.state_name && user.state_name !== '-'
          ? [user.state_name]
          : names
      return (
        <div className="space-y-1">
          <div className="text-xs text-muted-foreground">
            {t('users:states_label', { defaultValue: 'States' })}
          </div>
          <div className="text-sm">
            {fallback.length > 0 ? fallback.join(', ') : '—'}
          </div>
        </div>
      )
    }
    return (
      <div className="space-y-1">
        <div className="text-xs text-muted-foreground">
          {t('users:access_scope', { defaultValue: 'Access Scope' })}
        </div>
        <div className="text-sm">
          {getAccessScopeLabel(user, states, partnerNameById, t)}
        </div>
      </div>
    )
  }

  const renderAccessScopeCell = (user: ActiveUserListItem) => {
    const scope = getAccessScopeParts(user, states, partnerNameById, t)
    if (scope.details.length > 1) {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="max-w-full truncate text-start text-xs text-foreground/90 underline-offset-2 hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              {scope.label}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start" onClick={(e) => e.stopPropagation()}>
            <ul className="space-y-1 text-xs">
              {scope.details.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )
    }
    return (
      <span className="block truncate text-xs text-foreground/90" title={scope.label}>
        {scope.label}
      </span>
    )
  }

  return (
    <div className="space-y-4 text-sm">
      {error && <div className="text-destructive text-sm">{error}</div>}
      {successMessage && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {successMessage}
        </div>
      )}

      {/* Compact summary — secondary to the table */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>
          <span className="font-medium text-foreground tabular-nums">{summary.total}</span>{' '}
          {t('users:summary_total', { defaultValue: 'Total Users' })}
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-medium text-foreground tabular-nums">{summary.active}</span>{' '}
          {t('users:summary_active', { defaultValue: 'Active' })}
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-medium text-foreground tabular-nums">{summary.suspended}</span>{' '}
          {t('users:summary_suspended', { defaultValue: 'Suspended' })}
        </span>
        <span className="text-border">·</span>
        <span>
          <span className="font-medium text-foreground tabular-nums">{summary.baseErr}</span>{' '}
          {t('users:summary_base_err', { defaultValue: 'Base ERR' })}
        </span>
      </div>

      {/* Search + SmartFilter */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t('users:search_users', { defaultValue: 'Search users...' })}
            className="h-9 pl-8 text-sm"
            aria-label={t('users:search_users', { defaultValue: 'Search users...' })}
          />
        </div>
        <SmartFilter
          fields={filterFields}
          filters={filters}
          onFiltersChange={setFilters}
          urlParamPrefix="um_"
          className="min-w-0 flex-1 sm:items-end"
        />
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-border/60 bg-background">
        <div className="min-w-[720px]">
          <div className="grid grid-cols-[minmax(200px,1.6fr)_120px_minmax(140px,1.2fr)_120px_52px] gap-3 border-b border-border bg-muted/40 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <div>{t('users:user_column', { defaultValue: 'User' })}</div>
            <div>{t('users:role')}</div>
            <div>{t('users:access_scope', { defaultValue: 'Access Scope' })}</div>
            <div>{t('users:status')}</div>
            <div className="text-center">{t('users:actions')}</div>
          </div>

          {isLoading && users.length === 0 ? (
            <div className="px-4 py-12 text-center text-sm text-muted-foreground">
              {t('users:loading')}
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="px-4 py-12 text-center space-y-1">
              <div className="text-sm font-medium">
                {t('users:no_users', { defaultValue: 'No users found' })}
              </div>
              <div className="text-xs text-muted-foreground">
                {t('users:no_users_hint', {
                  defaultValue: 'Try changing your filters or search.',
                })}
              </div>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filteredUsers.map((user) => {
                const displayRole = pendingPartnerRoleUserIds.has(user.id)
                  ? 'partner'
                  : user.role
                const email = user.email

                return (
                  <div
                    key={user.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailsUserId(user.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setDetailsUserId(user.id)
                      }
                    }}
                    className="grid grid-cols-[minmax(200px,1.6fr)_120px_minmax(140px,1.2fr)_120px_52px] gap-3 px-4 py-2.5 items-center transition-colors hover:bg-muted/30 cursor-pointer outline-none focus-visible:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold tracking-wide text-muted-foreground"
                        aria-hidden
                      >
                        {getInitials(user.display_name)}
                      </div>
                      <div className="min-w-0 leading-tight">
                        <button
                          type="button"
                          className="block w-full truncate text-start text-sm font-semibold text-foreground hover:underline"
                          onClick={(e) => {
                            e.stopPropagation()
                            setDetailsUserId(user.id)
                          }}
                        >
                          {user.display_name || '—'}
                        </button>
                        {email ? (
                          <div className="truncate text-xs text-muted-foreground">{email}</div>
                        ) : null}
                      </div>
                    </div>

                    <div>
                      <Badge
                        variant="secondary"
                        className="h-5 max-w-full truncate rounded-md border border-border/60 bg-muted/60 px-1.5 text-[10px] font-medium text-foreground/80"
                      >
                        {roleLabel(displayRole, t)}
                      </Badge>
                    </div>

                    <div className="min-w-0">{renderAccessScopeCell(user)}</div>

                    <div>{renderStatus(user.status)}</div>

                    <div
                      className="flex justify-center"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <Popover
                        open={actionsOpenId === user.id}
                        onOpenChange={(open) =>
                          setActionsOpenId(open ? user.id : null)
                        }
                      >
                        <PopoverTrigger asChild>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                            aria-label={t('users:actions')}
                          >
                            <MoreHorizontal className="size-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="z-[200] w-52 p-1" align="end" collisionPadding={12}>
                          <div className="flex flex-col">
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                              onClick={() => openEditUser(user.id)}
                            >
                              <Pencil className="size-3.5 shrink-0 text-muted-foreground" />
                              {t('users:edit_user', { defaultValue: 'Edit User' })}
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                              onClick={() => openAccessRights(user.id)}
                            >
                              <Shield className="size-3.5 shrink-0 text-muted-foreground" />
                              {t('users:access_rights_action', {
                                defaultValue: 'Access Rights',
                              })}
                            </button>
                            <div className="my-1 h-px bg-border" role="separator" />
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                              onClick={() => openStatusConfirm(user.id)}
                            >
                              {user.status === 'active' ? (
                                <Pause className="size-3.5 shrink-0 text-muted-foreground" />
                              ) : (
                                <Play className="size-3.5 shrink-0 text-muted-foreground" />
                              )}
                              {user.status === 'active'
                                ? t('users:suspend_user', {
                                    defaultValue: 'Suspend User',
                                  })
                                : t('users:activate_user', {
                                    defaultValue: 'Activate User',
                                  })}
                            </button>
                            <div className="my-1 h-px bg-border" role="separator" />
                            <button
                              type="button"
                              className="inline-flex items-center gap-2 rounded-sm px-2 py-1.5 text-start text-xs text-destructive hover:bg-destructive/10 focus-visible:bg-destructive/10 focus-visible:outline-none"
                              onClick={() => openDeleteUser(user.id)}
                            >
                              <Trash2 className="size-3.5 shrink-0" />
                              {t('users:delete_user', { defaultValue: 'Delete User' })}
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
      {/* Pagination — server-side via getActiveUsers */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-muted-foreground">
          {t('users:showing_users', {
            defaultValue: 'Showing {{from}}–{{to}} of {{total}}',
            from: showingFrom,
            to: showingTo,
            total: totalUsers,
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{t('users:rows_per_page', { defaultValue: 'Rows per page' })}</span>
            <Select
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(Number(v))}
            >
              <SelectTrigger className="h-8 w-[72px] border-input bg-background text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isLoading || totalUsers === 0}
            >
              <ChevronLeft className="size-3.5" />
              {t('common:previous', { defaultValue: 'Previous' })}
            </Button>
            {pageNumbers.map((page, idx) =>
              page === 'ellipsis' ? (
                <span key={`e-${idx}`} className="px-1 text-xs text-muted-foreground">
                  …
                </span>
              ) : (
                <Button
                  key={page}
                  variant={page === currentPage ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 w-8 p-0 text-xs"
                  onClick={() => setCurrentPage(page)}
                  disabled={isLoading}
                >
                  {page}
                </Button>
              )
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-2 text-xs"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages || isLoading || totalUsers === 0}
            >
              {t('common:next', { defaultValue: 'Next' })}
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Details drawer */}
      <Sheet
        open={Boolean(detailsUser)}
        onOpenChange={(open) => {
          if (!open) setDetailsUserId(null)
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {detailsUser && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {t('users:user_details', { defaultValue: 'User Details' })}
                </SheetTitle>
                <SheetDescription className="sr-only">
                  {detailsUser.display_name || ''}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-5 px-4 pb-2">
                <div className="space-y-3">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t('users:display_name')}
                    </div>
                    <div className="text-sm font-medium">
                      {detailsUser.display_name || '—'}
                    </div>
                  </div>
                  {detailsUser.email ? (
                    <div>
                      <div className="text-xs text-muted-foreground">
                        {t('users:email', { defaultValue: 'Email' })}
                      </div>
                      <div className="text-sm">
                        {detailsUser.email}
                      </div>
                    </div>
                  ) : null}
                  <div>
                    <div className="text-xs text-muted-foreground">{t('users:status')}</div>
                    <div className="mt-0.5">{renderStatus(detailsUser.status)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">{t('users:role')}</div>
                    <div className="mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {roleLabel(
                          pendingPartnerRoleUserIds.has(detailsUser.id)
                            ? 'partner'
                            : detailsUser.role,
                          t
                        )}
                      </Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {t('users:access_scope', { defaultValue: 'Access Scope' })}
                    </div>
                    <div className="text-sm mt-0.5">
                      {getAccessScopeLabel(detailsUser, states, partnerNameById, t)}
                    </div>
                  </div>
                  {renderScopeDetails(detailsUser)}
                </div>
              </div>
              <SheetFooter className="border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditUser(detailsUser.id)}
                >
                  {t('users:edit_user', { defaultValue: 'Edit User' })}
                </Button>
                <Button
                  size="sm"
                  onClick={() => openAccessRights(detailsUser.id)}
                >
                  {t('users:access_rights_action', { defaultValue: 'Access Rights' })}
                </Button>
              </SheetFooter>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Access Rights editor (preserves existing role / partner / state access behavior) */}
      <Sheet
        open={Boolean(accessEditUser)}
        onOpenChange={(open) => {
          if (!open) setAccessEditUserId(null)
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
          {accessEditUser && (
            <>
              <SheetHeader>
                <SheetTitle>
                  {t('users:access_rights_action', { defaultValue: 'Access Rights' })}
                </SheetTitle>
                <SheetDescription>
                  {accessEditUser.display_name || '—'}
                </SheetDescription>
              </SheetHeader>
              <AccessRightsEditor
                user={accessEditUser}
                currentUserRole={currentUserRole}
                states={states}
                partners={partners}
                pendingPartner={pendingPartnerRoleUserIds.has(accessEditUser.id)}
                saving={savingUserId === accessEditUser.id}
                onRoleChange={handleRoleChange}
                onPartnerChange={handlePartnerOrgChange}
                onStateAccessChange={handleAccessRightsChange}
                t={t}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      <EditUserDialog
        open={Boolean(editUser)}
        onOpenChange={(open) => {
          if (!open) setEditUserId(null)
        }}
        user={editUser}
        currentUserRole={currentUserRole}
        currentUserId={currentUserId}
        onSaved={async () => {
          await refreshAfterMutation()
          showSuccess(
            t('users:user_updated', { defaultValue: 'User updated' })
          )
        }}
      />

      <DeleteUserDialog
        open={Boolean(deleteUser)}
        onOpenChange={(open) => {
          if (!open) setDeleteUserId(null)
        }}
        user={deleteUser}
        onDeleted={async () => {
          await refreshAfterMutation()
          showSuccess(
            t('users:user_deleted', { defaultValue: 'User deleted' })
          )
        }}
      />

      <StatusConfirmDialog
        open={Boolean(statusConfirmUser)}
        onOpenChange={(open) => {
          if (!open) setStatusConfirmUserId(null)
        }}
        user={statusConfirmUser}
        roleLabel={
          statusConfirmUser
            ? roleLabel(
                pendingPartnerRoleUserIds.has(statusConfirmUser.id)
                  ? 'partner'
                  : statusConfirmUser.role,
                t
              )
            : ''
        }
        accessScopeLabel={
          statusConfirmUser
            ? getAccessScopeLabel(statusConfirmUser, states, partnerNameById, t)
            : ''
        }
        onConfirmed={async () => {
          const wasActive = statusConfirmUser?.status === 'active'
          await refreshAfterMutation()
          showSuccess(
            wasActive
              ? t('users:user_suspended', { defaultValue: 'User suspended' })
              : t('users:user_activated', { defaultValue: 'User activated' })
          )
        }}
      />
    </div>
  )
}

function AccessRightsEditor({
  user,
  currentUserRole,
  states,
  partners,
  pendingPartner,
  saving,
  onRoleChange,
  onPartnerChange,
  onStateAccessChange,
  t,
}: {
  user: ActiveUserListItem
  currentUserRole: string
  states: State[]
  partners: PartnerOption[]
  pendingPartner: boolean
  saving: boolean
  onRoleChange: (userId: string, role: PortalRole) => void
  onPartnerChange: (userId: string, partnerId: string) => void
  onStateAccessChange: (
    userId: string,
    canSeeAll: boolean,
    visibleStates: string[],
    role: string
  ) => void
  t: (key: string, opts?: Record<string, string>) => string
}) {
  const displayRole = pendingPartner ? 'partner' : user.role
  const isPartner = displayRole === 'partner'
  const canSeeAll = user.can_see_all_states ?? true
  const userStates = user.visible_states || []
  const canChangeStateAccess =
    !isPartner &&
    (currentUserRole === 'support' ||
      currentUserRole === 'superadmin' ||
      user.role !== 'admin')
  const roleDisabled =
    saving ||
    user.role === 'support' ||
    (user.role === 'superadmin' && currentUserRole !== 'support') ||
    (user.role === 'admin' &&
      currentUserRole !== 'superadmin' &&
      currentUserRole !== 'support')

  return (
    <div className="space-y-5 px-4 pb-6">
      <div className="space-y-2">
        <label className="text-xs font-medium text-muted-foreground">{t('users:role')}</label>
        <Select
          value={displayRole}
          onValueChange={(value) => onRoleChange(user.id, value as PortalRole)}
          disabled={roleDisabled}
        >
          <SelectTrigger className="h-8 w-full border-input bg-background text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {currentUserRole === 'support' && (
              <SelectItem value="support">{t('users:support_role')}</SelectItem>
            )}
            <SelectItem value="superadmin">{t('users:superadmin_role')}</SelectItem>
            {(currentUserRole === 'support' || currentUserRole === 'superadmin') && (
              <SelectItem value="admin">{t('users:admin_role')}</SelectItem>
            )}
            <SelectItem value="state_err">{t('users:state_err_role')}</SelectItem>
            <SelectItem value="base_err">{t('users:base_err_role')}</SelectItem>
            <SelectItem value="partner">
              {t('users:partner_role', { defaultValue: 'Partner' })}
            </SelectItem>
          </SelectContent>
        </Select>
        {saving && (
          <div className="text-xs text-muted-foreground">
            {t('common:saving', { defaultValue: 'Saving...' })}
          </div>
        )}
      </div>

      {isPartner ? (
        <div className="space-y-2">
          <label className="text-xs font-medium text-muted-foreground">
            {t('users:partner_org', { defaultValue: 'Partner organization' })}
          </label>
          <Select
            value={user.partner_id || undefined}
            onValueChange={(value) => onPartnerChange(user.id, value)}
            disabled={saving}
          >
            <SelectTrigger className="h-8 w-full border-input bg-background text-xs">
              <SelectValue
                placeholder={t('users:select_partner', {
                  defaultValue: 'Select partner…',
                })}
              />
            </SelectTrigger>
            <SelectContent>
              {partners.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pendingPartner && !user.partner_id && (
            <div className="text-[11px] text-amber-700">
              {t('users:select_partner_to_save', {
                defaultValue: 'Select partner org to save',
              })}
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t('users:partner_grant_scoped', {
              defaultValue: 'Partner users are grant-scoped (state access N/A).',
            })}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground">
            {t('users:state_access', { defaultValue: 'State Access' })}
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id={`all-states-${user.id}`}
              checked={canSeeAll}
              disabled={!canChangeStateAccess || saving}
              onCheckedChange={(checked) => {
                if (!canChangeStateAccess) return
                if (checked) {
                  onStateAccessChange(user.id, true, [], user.role)
                } else {
                  onStateAccessChange(user.id, false, userStates, user.role)
                }
              }}
            />
            <label htmlFor={`all-states-${user.id}`} className="text-xs cursor-pointer">
              {t('users:can_see_all_states', { defaultValue: 'Can see all states' })}
            </label>
          </div>
          {!canSeeAll && (
            <div className="max-h-64 space-y-1 overflow-y-auto border-t pt-2">
              {states.length === 0 ? (
                <div className="text-xs text-muted-foreground">
                  {t('users:loading_states', { defaultValue: 'Loading states...' })}
                </div>
              ) : (
                states.map((state) => {
                  const isSelected = userStates.includes(state.id)
                  return (
                    <div key={state.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`state-${user.id}-${state.id}`}
                        checked={isSelected}
                        disabled={!canChangeStateAccess || saving}
                        onCheckedChange={(checked) => {
                          if (!canChangeStateAccess) return
                          const newStates = checked
                            ? [...userStates, state.id]
                            : userStates.filter((id) => id !== state.id)
                          onStateAccessChange(user.id, false, newStates, user.role)
                        }}
                      />
                      <label
                        htmlFor={`state-${user.id}-${state.id}`}
                        className="text-xs cursor-pointer flex-1"
                      >
                        {state.state_name}
                      </label>
                    </div>
                  )
                })
              )}
            </div>
          )}
          {!canChangeStateAccess && (
            <p className="text-[11px] text-muted-foreground">
              {t('users:admin_state_access_hint', {
                defaultValue:
                  'Only superadmin or support can change state access for admin users',
              })}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
