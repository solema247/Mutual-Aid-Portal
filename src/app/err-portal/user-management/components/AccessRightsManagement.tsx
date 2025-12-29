'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback, useRef } from 'react'
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
import { ActiveUserListItem } from '@/app/api/users/types/users'
import { getActiveUsers } from '@/app/api/users/utils/users'

interface State {
  id: string
  state_name: string
  state_name_ar: string | null
}

interface AccessRightsManagementProps {
  currentUserRole: string
  currentUserErrId: string | null
}

const PAGE_SIZE = 20

export default function AccessRightsManagement({
  currentUserRole,
  currentUserErrId
}: AccessRightsManagementProps) {
  const { t } = useTranslation(['users', 'common'])
  const [users, setUsers] = useState<ActiveUserListItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [totalUsers, setTotalUsers] = useState(0)
  const [selectedRole, setSelectedRole] = useState<string>('all')
  const [states, setStates] = useState<State[]>([])
  const [openDropdownId, setOpenDropdownId] = useState<string | null>(null)
  const [editingUser, setEditingUser] = useState<string | null>(null)
  const [savingUserId, setSavingUserId] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Fetch states
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

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpenDropdownId(null)
      }
    }

    if (openDropdownId) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [openDropdownId])

  const fetchUsers = useCallback(async () => {
    try {
      setIsLoading(true)
      const { users: fetchedUsers, total } = await getActiveUsers({
        page: currentPage,
        pageSize: PAGE_SIZE,
        role: selectedRole === 'all' ? undefined : selectedRole as 'admin' | 'state_err' | 'base_err',
        status: 'active',
        sortOrder: 'desc',
        currentUserRole,
        currentUserErrId
      })

      const formattedUsers: ActiveUserListItem[] = fetchedUsers.map(user => ({
        id: user.id,
        err_id: user.err_id,
        display_name: user.display_name,
        role: user.role as 'admin' | 'state_err' | 'base_err',
        status: user.status as 'active' | 'suspended',
        createdAt: new Date(user.created_at || '').toLocaleDateString(),
        updatedAt: user.updated_at ? new Date(user.updated_at).toLocaleDateString() : null,
        err_name: user.emergency_rooms?.name || '-',
        err_code: user.emergency_rooms?.err_code || '-',
        state_name: user.emergency_rooms?.state?.state_name || '-',
        can_see_all_states: user.can_see_all_states ?? true,
        visible_states: user.visible_states || []
      }))

      setUsers(formattedUsers)
      setTotalUsers(total)
    } catch (err) {
      setError(t('common:error_fetching_data'))
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, selectedRole, currentUserRole, currentUserErrId, t])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  // Reset to first page when filter changes
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedRole])

  const handleRoleChange = async (userId: string, newRole: 'admin' | 'state_err' | 'base_err') => {
    try {
      setSavingUserId(userId)
      const res = await fetch(`/api/users/${userId}/access-rights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      })

      if (!res.ok) {
        throw new Error('Failed to update role')
      }

      // Refresh users
      await fetchUsers()
    } catch (error) {
      console.error('Error updating role:', error)
      setError(t('common:error_updating_user'))
    } finally {
      setSavingUserId(null)
    }
  }

  const handleAccessRightsChange = async (
    userId: string,
    canSeeAllStates: boolean,
    visibleStates: string[]
  ) => {
    try {
      setSavingUserId(userId)
      const res = await fetch(`/api/users/${userId}/access-rights`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          can_see_all_states: canSeeAllStates,
          visible_states: canSeeAllStates ? [] : visibleStates
        })
      })

      if (!res.ok) {
        throw new Error('Failed to update access rights')
      }

      // Refresh users
      await fetchUsers()
      setOpenDropdownId(null)
    } catch (error) {
      console.error('Error updating access rights:', error)
      setError(t('common:error_updating_user'))
    } finally {
      setSavingUserId(null)
    }
  }

  const totalPages = Math.ceil(totalUsers / PAGE_SIZE)

  if (isLoading && users.length === 0) {
    return <div className="text-muted-foreground">{t('users:loading')}</div>
  }

  if (error) {
    return <div className="text-destructive text-sm">{error}</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-4 items-center">
        <Select
          value={selectedRole}
          onValueChange={setSelectedRole}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('users:filter_by_role')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('users:all_roles')}</SelectItem>
            <SelectItem value="admin">{t('users:admin_role')}</SelectItem>
            <SelectItem value="state_err">{t('users:state_err_role')}</SelectItem>
            <SelectItem value="base_err">{t('users:base_err_role')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-md border">
        <div className="grid grid-cols-5 gap-4 p-4 font-medium border-b">
          <div>{t('users:display_name')}</div>
          <div>{t('users:role')}</div>
          <div>State Access</div>
          <div>{t('users:err_name')}</div>
          <div>{t('users:status')}</div>
        </div>
        <div className="divide-y">
          {users.map((user) => {
            const isDropdownOpen = openDropdownId === user.id
            const userStates = user.visible_states || []
            const canSeeAll = user.can_see_all_states ?? true

            return (
              <div key={user.id} className="grid grid-cols-5 gap-4 p-4 hover:bg-muted/50">
                <div className="flex items-center">{user.display_name || '-'}</div>
                
                <div className="flex items-center">
                  <Select
                    value={user.role}
                    onValueChange={(value) => handleRoleChange(user.id, value as 'admin' | 'state_err' | 'base_err')}
                    disabled={savingUserId === user.id}
                  >
                    <SelectTrigger className="w-[140px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">{t('users:admin_role')}</SelectItem>
                      <SelectItem value="state_err">{t('users:state_err_role')}</SelectItem>
                      <SelectItem value="base_err">{t('users:base_err_role')}</SelectItem>
                    </SelectContent>
                  </Select>
                  {savingUserId === user.id && (
                    <span className="ml-2 text-xs text-muted-foreground">Saving...</span>
                  )}
                </div>

                <div className="relative" ref={openDropdownId === user.id ? dropdownRef : null}>
                  <div
                    className="flex flex-wrap gap-1 cursor-pointer min-h-[32px] p-1 border rounded-md hover:bg-accent"
                    onClick={() => setOpenDropdownId(isDropdownOpen ? null : user.id)}
                  >
                    {canSeeAll ? (
                      <Badge variant="default" className="bg-blue-500 hover:bg-blue-600">
                        All States
                      </Badge>
                    ) : userStates.length > 0 ? (
                      userStates.map((stateId) => {
                        const state = states.find(s => s.id === stateId)
                        return state ? (
                          <Badge key={stateId} variant="secondary" className="bg-green-500 hover:bg-green-600">
                            {state.state_name}
                          </Badge>
                        ) : null
                      })
                    ) : (
                      <span className="text-xs text-muted-foreground">No states</span>
                    )}
                  </div>

                  {isDropdownOpen && (
                    <div className="absolute z-50 mt-1 w-80 bg-popover border rounded-md shadow-lg p-4 left-0 top-full">
                      <div className="space-y-3">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id={`all-states-${user.id}`}
                            checked={canSeeAll}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                handleAccessRightsChange(user.id, true, [])
                              } else {
                                handleAccessRightsChange(user.id, false, userStates)
                              }
                            }}
                          />
                          <label
                            htmlFor={`all-states-${user.id}`}
                            className="text-sm font-medium cursor-pointer"
                          >
                            Can see all states
                          </label>
                        </div>

                        {!canSeeAll && (
                          <div className="space-y-2 max-h-60 overflow-y-auto border-t pt-3">
                            <div className="text-xs font-medium text-muted-foreground mb-2">
                              Select specific states:
                            </div>
                            {states.length === 0 ? (
                              <div className="text-xs text-muted-foreground">Loading states...</div>
                            ) : (
                              states.map((state) => {
                                const isSelected = userStates.includes(state.id)
                                return (
                                  <div key={state.id} className="flex items-center space-x-2">
                                    <Checkbox
                                      id={`state-${user.id}-${state.id}`}
                                      checked={isSelected}
                                      onCheckedChange={(checked) => {
                                        const newStates = checked
                                          ? [...userStates, state.id]
                                          : userStates.filter(id => id !== state.id)
                                        handleAccessRightsChange(user.id, false, newStates)
                                      }}
                                    />
                                    <label
                                      htmlFor={`state-${user.id}-${state.id}`}
                                      className="text-sm cursor-pointer flex-1"
                                    >
                                      {state.state_name}
                                    </label>
                                  </div>
                                )
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center">{user.err_name || '-'}</div>
                <div className="flex items-center">{t(`users:${user.status}_status`)}</div>
              </div>
            )
          })}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <div className="text-sm text-muted-foreground">
            Showing {((currentPage - 1) * PAGE_SIZE) + 1} to {Math.min(currentPage * PAGE_SIZE, totalUsers)} of {totalUsers} users
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

