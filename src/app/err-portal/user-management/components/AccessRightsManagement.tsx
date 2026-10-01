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
import { ActiveUserListItem } from '@/app/api/users/types/users'
import { getActiveUsers } from '@/app/api/users/utils/users'
import { supabase } from '@/lib/supabaseClient'
import {
  SmartFilter,
  getUserManagementFilterFields,
  type ActiveFilter,
} from '@/components/smart-filter'
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Globe2,
  Handshake,
  MapPin,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  RefreshCw,
  Search,
  Shield,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getPortalRoleLabel } from '@/lib/roleLabels'
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

function roleBadgeClass(role: string): string {
  switch (role) {
    case 'admin':
      return 'border-violet-200 bg-violet-50 text-violet-700'
    case 'superadmin':
      return 'border-purple-200 bg-purple-50 text-purple-800'
    case 'support':
      return 'border-slate-200 bg-slate-50 text-slate-700'
    case 'state_err':
      return 'border-orange-200 bg-orange-50 text-orange-700'
    case 'base_err':
      return 'border-sky-200 bg-sky-50 text-sky-700'
    case 'partner':
      return 'border-teal-200 bg-teal-50 text-teal-700'
    default:
      return 'border-border bg-muted text-foreground/80'
  }
}

function avatarTone(name: string | null | undefined): string {
  const tones = [
    'bg-sky-100 text-sky-700',
    'bg-violet-100 text-violet-700',
    'bg-emerald-100 text-emerald-700',
    'bg-amber-100 text-amber-800',
    'bg-rose-100 text-rose-700',
    'bg-teal-100 text-teal-700',
  ]
  const key = (name || '?').trim()
  let hash = 0
  for (let i = 0; i < key.length; i += 1) hash = (hash + key.charCodeAt(i) * (i + 1)) % tones.length
  return tones[hash]
}

function getAccessScopeParts(
  user: ActiveUserListItem,
  states: State[],
  partnerNameById: Map<string, string>,
  t: (key: string, opts?: Record<string, string | number>) => string
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
  t: (key: string, opts?: Record<string, string | number>) => string
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
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
      setError(null)

      const params = new URLSearchParams()
      params.set('page', String(currentPage))
      params.set('pageSize', String(pageSize))
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim())
      if (selectedRoles.length > 0) params.set('roles', selectedRoles.join(','))
      if (selectedStatuses.length > 0) {
        params.set('statuses', selectedStatuses.join(','))
      }
      if (selectedStates.length > 0) {
        params.set('stateFilters', selectedStates.join(','))
      }
      if (selectedScopes.length > 0) params.set('scopes', selectedScopes.join(','))
      if (selectedErrIds.length > 0) params.set('errIds', selectedErrIds.join(','))
      if (selectedPartnerIds.length > 0) {
        params.set('partnerIds', selectedPartnerIds.join(','))
      }

      const res = await fetch(`/api/users/active?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(
          typeof body?.error === 'string' ? body.error : 'Failed to fetch users'
        )
      }

      const data = (await res.json()) as {
        users: ActiveUserListItem[]
        total: number
      }

      setUsers(data.users || [])
      setTotalUsers(data.total ?? 0)
      setPendingPartnerRoleUserIds(new Set())
      setSelectedIds(new Set())
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
          { value: 'admin', label: getPortalRoleLabel('admin', t) },
          { value: 'superadmin', label: getPortalRoleLabel('superadmin', t) },
          { value: 'support', label: getPortalRoleLabel('support', t) },
          { value: 'state_err', label: getPortalRoleLabel('state_err', t) },
          { value: 'base_err', label: getPortalRoleLabel('base_err', t) },
          { value: 'partner', label: getPortalRoleLabel('partner', t) },
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

  const renderStatus = (status: 'active' | 'suspended') => {
    const isActive = status === 'active'
    return (
      <span
        className={cn(
          'inline-flex items-center gap-1.5 rounded-md px-2.5 py-0.5 text-[11px] font-medium',
          isActive
            ? 'bg-emerald-50 text-emerald-700'
            : 'bg-amber-50 text-amber-800'
        )}
      >
        <span
          className={cn(
            'size-1.5 shrink-0 rounded-full',
            isActive ? 'bg-emerald-500' : 'bg-amber-500'
          )}
          aria-hidden
        />
        <span className="sr-only">{isActive ? 'Active' : 'Suspended'}: </span>
        {t(`users:${status}_status`)}
      </span>
    )
  }

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
    const ScopeIcon =
      user.role === 'partner'
        ? Handshake
        : user.role === 'base_err'
          ? Building2
          : scope.details.length > 1
            ? MapPin
            : scope.label.toLowerCase().includes('all')
              ? Globe2
              : MapPin

    const pill = (
      <span className="inline-flex max-w-full items-center gap-1.5 truncate rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-foreground/90 dark:border-border/50 dark:bg-muted/40">
        <ScopeIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span className="truncate">{scope.label}</span>
      </span>
    )

    if (scope.details.length > 1) {
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="max-w-full text-start"
              onClick={(e) => e.stopPropagation()}
            >
              {pill}
            </button>
          </PopoverTrigger>
          <PopoverContent
            className="z-[200] w-56 p-2"
            align="start"
            collisionPadding={12}
            onClick={(e) => e.stopPropagation()}
          >
            <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
              {scope.details.map((name) => (
                <li key={name} className="truncate text-foreground/90">
                  {name}
                </li>
              ))}
            </ul>
          </PopoverContent>
        </Popover>
      )
    }
    return (
      <span className="block max-w-full" title={scope.label}>
        {pill}
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

      {/* Summary cards — metrics with compact status chips (no large icons) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: t('users:summary_total', { defaultValue: 'Total Users' }),
            value: summary.total,
            description: t('users:summary_total_desc', {
              defaultValue: 'Total registered users',
            }),
            badge: t('users:summary_badge_all', { defaultValue: 'All' }),
            badgeClass: 'bg-emerald-50 text-emerald-700',
          },
          {
            label: t('users:summary_active', { defaultValue: 'Active' }),
            value: summary.active,
            description: t('users:summary_active_desc', {
              defaultValue: 'Currently active',
            }),
            badge: t('users:summary_badge_live', { defaultValue: 'Live' }),
            badgeClass: 'bg-sky-50 text-sky-700',
          },
          {
            label: t('users:summary_suspended', { defaultValue: 'Suspended' }),
            value: summary.suspended,
            description: t('users:summary_suspended_desc', {
              defaultValue: 'Currently suspended',
            }),
            badge: t('users:summary_badge_hold', { defaultValue: 'Hold' }),
            badgeClass: 'bg-amber-50 text-amber-800',
          },
          {
            label: t('users:summary_base_err', { defaultValue: 'Beneficiary Entity' }),
            value: summary.baseErr,
            description: t('users:summary_base_err_desc', {
              defaultValue: 'Room-scoped users',
            }),
            badge: t('users:summary_badge_scoped', { defaultValue: 'Scoped' }),
            badgeClass: 'bg-slate-100 text-slate-600',
          },
        ].map((card) => (
          <div
            key={card.label}
            className="rounded-lg border border-slate-100 bg-white p-4 shadow-sm dark:border-border/40 dark:bg-card"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="text-[11px] font-medium text-muted-foreground">
                {card.label}
              </div>
              <span
                className={cn(
                  'inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-semibold',
                  card.badgeClass
                )}
              >
                {card.badge}
              </span>
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground">
              {card.value.toLocaleString()}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">{card.description}</div>
          </div>
        ))}
      </div>

      {/* Unified directory panel */}
      <div className="overflow-hidden rounded-lg border border-slate-100 bg-white shadow-sm dark:border-border/40 dark:bg-card">
        <div className="flex flex-row flex-wrap items-center gap-2 border-b border-slate-100 px-4 py-3 dark:border-border/40">
          <div className="relative w-full max-w-xs shrink-0 sm:w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('users:search_users', { defaultValue: 'Search users...' })}
              className="h-8 rounded-md border-slate-200 bg-background pl-8 text-sm"
              aria-label={t('users:search_users', { defaultValue: 'Search users...' })}
            />
          </div>
          <SmartFilter
            fields={filterFields}
            filters={filters}
            onFiltersChange={setFilters}
            urlParamPrefix="um_"
            layout="inline"
            className="min-w-0 flex-1"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto h-8 w-8 shrink-0 rounded-md border-slate-200 p-0"
            onClick={() => void refreshAfterMutation()}
            disabled={isLoading}
            aria-label={t('common:refresh', { defaultValue: 'Refresh' })}
          >
            <RefreshCw className={cn('size-4', isLoading && 'animate-spin')} />
          </Button>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[36px_minmax(220px,1.8fr)_120px_minmax(140px,1.2fr)_110px_88px] items-center gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground dark:border-border/40 dark:bg-muted/15">
              <div className="flex items-center">
                <Checkbox
                  checked={
                    filteredUsers.length > 0 &&
                    filteredUsers.every((u) => selectedIds.has(u.id))
                      ? true
                      : filteredUsers.some((u) => selectedIds.has(u.id))
                        ? 'indeterminate'
                        : false
                  }
                  onCheckedChange={(checked) => {
                    if (checked === true) {
                      setSelectedIds(new Set(filteredUsers.map((u) => u.id)))
                    } else {
                      setSelectedIds(new Set())
                    }
                  }}
                  aria-label={t('users:select_all', { defaultValue: 'Select all' })}
                />
              </div>
              <div>{t('users:user_column', { defaultValue: 'User' })}</div>
              <div>{t('users:role')}</div>
              <div>{t('users:access_scope', { defaultValue: 'Access Scope' })}</div>
              <div>{t('users:status')}</div>
              <div className="text-end">{t('users:actions')}</div>
            </div>

            {isLoading && users.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                {t('users:loading')}
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="space-y-1 px-4 py-8 text-center">
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
              <div className="divide-y divide-slate-100 dark:divide-border/40">
                {filteredUsers.map((user) => {
                  const displayRole = pendingPartnerRoleUserIds.has(user.id)
                    ? 'partner'
                    : user.role
                  const email = user.email?.trim() || null

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
                      className="grid grid-cols-[36px_minmax(220px,1.8fr)_120px_minmax(140px,1.2fr)_110px_88px] items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 cursor-pointer outline-none focus-visible:bg-slate-50 dark:hover:bg-muted/20"
                    >
                      <div
                        className="flex items-center"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Checkbox
                          checked={selectedIds.has(user.id)}
                          onCheckedChange={(checked) => {
                            setSelectedIds((prev) => {
                              const next = new Set(prev)
                              if (checked === true) next.add(user.id)
                              else next.delete(user.id)
                              return next
                            })
                          }}
                          aria-label={t('users:select_user', {
                            defaultValue: 'Select user',
                          })}
                        />
                      </div>

                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className={cn(
                            'flex size-9 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold tracking-wide',
                            avatarTone(user.display_name)
                          )}
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
                            <div className="truncate text-xs text-muted-foreground">
                              {email}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div>
                        <span
                          className={cn(
                            'inline-flex h-6 max-w-full items-center truncate rounded-md border px-2 text-[10px] font-semibold',
                            roleBadgeClass(displayRole)
                          )}
                        >
                          {getPortalRoleLabel(displayRole, t)}
                        </span>
                      </div>

                      <div className="min-w-0">{renderAccessScopeCell(user)}</div>

                      <div>{renderStatus(user.status)}</div>

                      <div
                        className="flex items-center justify-end gap-0.5"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                          aria-label={t('users:user_details', { defaultValue: 'User Details' })}
                          onClick={() => setDetailsUserId(user.id)}
                        >
                          <Eye className="size-4" />
                        </Button>
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

        <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-border/40">
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>
              {t('users:showing_users', {
                defaultValue: 'Showing {{from}}–{{to}} of {{total}}',
                from: showingFrom,
                to: showingTo,
                total: totalUsers,
              })}
            </span>
            <div className="flex items-center gap-2">
              <span>{t('users:rows_per_page', { defaultValue: 'Rows' })}</span>
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
                        {getPortalRoleLabel(
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
        accessScopeLabel={
          editUser
            ? getAccessScopeLabel(editUser, states, partnerNameById, t)
            : null
        }
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
            ? getPortalRoleLabel(
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
              <SelectItem value="support">{getPortalRoleLabel('support', t)}</SelectItem>
            )}
            <SelectItem value="superadmin">{getPortalRoleLabel('superadmin', t)}</SelectItem>
            {(currentUserRole === 'support' || currentUserRole === 'superadmin') && (
              <SelectItem value="admin">{getPortalRoleLabel('admin', t)}</SelectItem>
            )}
            <SelectItem value="state_err">{getPortalRoleLabel('state_err', t)}</SelectItem>
            <SelectItem value="base_err">{getPortalRoleLabel('base_err', t)}</SelectItem>
            <SelectItem value="partner">{getPortalRoleLabel('partner', t)}</SelectItem>
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
