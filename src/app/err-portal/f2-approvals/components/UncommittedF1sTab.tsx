'use client'

import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Edit2, Save, X, Trash2, ArrowUp, ArrowDown } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProjectEditor from './ProjectEditor'
import type { UncommittedF1 } from '../types'
import CommunityApprovalCell from './CommunityApprovalCell'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { SmartFilter, getF2UncommittedFilterFields, type ActiveFilter } from '@/components/smart-filter'
import { applyF2SmartFilters } from '../applyF2Filters'

export default function UncommittedF1sTab() {
  const { t, i18n } = useTranslation(['f2', 'common'])
  const { can } = useAllowedFunctions()
  const canCommit = can('f2_commit')
  const canUploadApproval = can('f2_upload_approval')
  const canEditProject = can('f2_edit_project')
  const searchParams = useSearchParams()
  const [f1s, setF1s] = useState<UncommittedF1[]>([])
  const [selectedF1s, setSelectedF1s] = useState<string[]>([])
  const [editingExpenses, setEditingExpenses] = useState<Record<string, boolean>>({})
  const [tempExpenses, setTempExpenses] = useState<Record<string, Array<{ activity: string; total_cost: number }>>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [isCommitting, setIsCommitting] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editorProjectId, setEditorProjectId] = useState<string | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingF1Id, setDeletingF1Id] = useState<string | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [currentPage, setCurrentPage] = useState(1)
  const itemsPerPage = 10
  const [filters, setFilters] = useState<ActiveFilter[]>([])
  const [dateSort, setDateSort] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    fetchUncommittedF1s()
  }, [])

  useEffect(() => {
    const editProjectId = searchParams.get('editProjectId')
    if (editProjectId) {
      setEditorProjectId(editProjectId)
      setEditorOpen(true)
    }
  }, [searchParams])

  const fetchUncommittedF1s = async () => {
    try {
      const response = await fetch('/api/f2/uncommitted')
      if (!response.ok) throw new Error('Failed to fetch uncommitted F1s')
      const data = await response.json()
      setF1s(data)
    } catch (error) {
      console.error('Error fetching uncommitted F1s:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const filterFields = useMemo(() => {
    const stateOptions = Array.from(new Set(f1s.map((f) => f.state).filter(Boolean))).sort()
    return getF2UncommittedFilterFields({
      stateOptions,
      labels: {
        search: t('f2:search'),
        searchPlaceholder: t('f2:search_placeholder'),
        state: t('f2:state_label'),
        dateRange: t('f2:date_range'),
        all: t('f2:all'),
      },
    })
  }, [f1s, t])

  const filteredF1s = useMemo(
    () => applyF2SmartFilters({ data: f1s, filters, fields: filterFields }),
    [f1s, filters, filterFields]
  )

  useEffect(() => {
    setCurrentPage(1)
  }, [filters])


  const calculateTotalAmount = (expenses: Array<{ activity: string; total_cost: number }>) => {
    return expenses.reduce((sum, exp) => sum + (exp.total_cost || 0), 0)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedF1s(filteredF1s.filter(f1 => !f1.compliance_blocked).map(f1 => f1.id))
    } else {
      setSelectedF1s([])
    }
  }

  const handleSelectF1 = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedF1s(prev => [...prev, id])
    } else {
      setSelectedF1s(prev => prev.filter(f1Id => f1Id !== id))
    }
  }

  const handleEditExpenses = (f1Id: string) => {
    const f1 = f1s.find(f => f.id === f1Id)
    if (f1) {
      setTempExpenses(prev => ({ ...prev, [f1Id]: [...f1.expenses] }))
      setEditingExpenses(prev => ({ ...prev, [f1Id]: true }))
    }
  }

  const handleSaveExpenses = async (f1Id: string) => {
    try {
      const expenses = tempExpenses[f1Id]
      const response = await fetch('/api/f2/uncommitted', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f1Id, expenses })
      })

      if (!response.ok) throw new Error('Failed to save expenses')

      setF1s(prev => prev.map(f1 => 
        f1.id === f1Id ? { ...f1, expenses } : f1
      ))
      setEditingExpenses(prev => ({ ...prev, [f1Id]: false }))
    } catch (error) {
      console.error('Error saving expenses:', error)
      alert('Failed to save expenses')
    }
  }

  const handleCancelEditExpenses = (f1Id: string) => {
    setEditingExpenses(prev => ({ ...prev, [f1Id]: false }))
    delete tempExpenses[f1Id]
  }

  const handleExpenseChange = (f1Id: string, index: number, field: 'activity' | 'total_cost', value: string | number) => {
    setTempExpenses(prev => ({
      ...prev,
      [f1Id]: prev[f1Id].map((exp, i) => 
        i === index ? { ...exp, [field]: value } : exp
      )
    }))
  }

  const handleAddExpense = (f1Id: string) => {
    setTempExpenses(prev => ({
      ...prev,
      [f1Id]: [...prev[f1Id], { activity: '', total_cost: 0 }]
    }))
  }

  const handleRemoveExpense = (f1Id: string, index: number) => {
    setTempExpenses(prev => ({
      ...prev,
      [f1Id]: prev[f1Id].filter((_, i) => i !== index)
    }))
  }


  const handleCommitSelected = async () => {
    if (selectedF1s.length === 0) {
      alert('Please select F1s to commit')
      return
    }

    setIsCommitting(true)
    try {
      const response = await fetch('/api/f2/uncommitted/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ f1_ids: selectedF1s })
      })

      if (!response.ok) {
        const err: { error?: string; code?: string } = await response.json().catch(() => ({}))
        if (err.code === 'COMPLIANCE_BLOCKED') {
          alert('Cannot commit: one or more selected F1s are blocked by compliance (missing ID or sanctions match — payment stopped).')
        } else {
          alert(err.error || 'Failed to commit F1s')
        }
        return
      }

      const result = await response.json()
      alert(`Successfully committed ${result.committed_count} F1(s)`)
      setSelectedF1s([])
      await fetchUncommittedF1s()
    } catch (error) {
      console.error('Error committing F1s:', error)
      alert('Failed to commit F1s')
    } finally {
      setIsCommitting(false)
    }
  }

  const handleDeleteClick = (f1Id: string) => {
    setDeletingF1Id(f1Id)
    setDeleteDialogOpen(true)
  }

  const handleDeleteConfirm = async () => {
    if (!deletingF1Id) return

    setIsDeleting(true)
    try {
      const response = await fetch('/api/f2/uncommitted', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deletingF1Id })
      })

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Failed to delete F1' }))
        alert(error.error || t('f2:delete_failed'))
        return
      }

      // Remove from selected if it was selected
      setSelectedF1s(prev => prev.filter(id => id !== deletingF1Id))
      await fetchUncommittedF1s()
      setDeleteDialogOpen(false)
      setDeletingF1Id(null)
    } catch (error) {
      console.error('Error deleting F1:', error)
      alert(t('f2:delete_failed'))
    } finally {
      setIsDeleting(false)
    }
  }

  if (isLoading) {
    return <div className="text-center py-8">{t('common:loading')}</div>
  }

  const sortedF1s = [...filteredF1s].sort((a, b) => {
    const dA = new Date(a.date).getTime()
    const dB = new Date(b.date).getTime()
    return dateSort === 'desc' ? dB - dA : dA - dB
  })
  const totalPages = Math.ceil(sortedF1s.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedF1s = sortedF1s.slice(startIndex, endIndex)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <SmartFilter
              className="min-w-0 flex-1"
              fields={filterFields}
              filters={filters}
              onFiltersChange={setFilters}
              urlParamPrefix="f2u_"
              title={t('f2:uncommitted_tab')}
              count={filteredF1s.length}
            />
            {canCommit && (
              <Button
                className="shrink-0"
                onClick={handleCommitSelected}
                disabled={selectedF1s.length === 0 || isCommitting}
              >
                {isCommitting ? t('f2:committing') : t('f2:commit_selected', { count: selectedF1s.length })}
              </Button>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{t('f2:uncommitted_desc')}</p>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'} className="text-xs min-w-[700px]">
            <TableHeader>
              <TableRow className="[&>th]:py-2 [&>th]:px-2 [&>th]:text-xs">
                <TableHead className="w-10 px-2">
                  {canCommit && (
                    <Checkbox
                      checked={selectedF1s.length === filteredF1s.filter(f => !f.compliance_blocked).length && filteredF1s.filter(f => !f.compliance_blocked).length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  )}
                </TableHead>
                <TableHead className="px-2">{t('f2:err_id')}</TableHead>
                <TableHead className="px-2">
                  <button
                    type="button"
                    onClick={() => setDateSort(prev => prev === 'desc' ? 'asc' : 'desc')}
                    className="flex items-center gap-1 hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring rounded"
                  >
                    {t('f2:date') || 'Date'}
                    {dateSort === 'desc' ? <ArrowDown className="w-3 h-3" /> : <ArrowUp className="w-3 h-3" />}
                  </button>
                </TableHead>
                <TableHead className="px-2">{t('f2:state')}</TableHead>
                <TableHead className="px-2">{t('f2:locality')}</TableHead>
                <TableHead className="text-right px-2">{t('f2:requested_amount')}</TableHead>
                <TableHead className="px-2">Compliance</TableHead>
                <TableHead className="px-2">{t('f2:community_approval')}</TableHead>
                <TableHead className="px-2">{t('f2:actions') || 'Actions'}</TableHead>
                {/* Status column removed visually */}
              </TableRow>
            </TableHeader>
            <TableBody>
                {paginatedF1s.map((f1) => (
                <TableRow key={f1.id} className="[&>td]:py-1.5 [&>td]:px-2 [&>td]:text-xs">
                  <TableCell className="px-2">
                    {canCommit && (
                      <Checkbox
                        checked={selectedF1s.includes(f1.id)}
                        disabled={!!f1.compliance_blocked}
                        title={f1.compliance_blocked ? 'Flagged by compliance screening — pending finance review' : undefined}
                        onCheckedChange={(checked) => handleSelectF1(f1.id, checked as boolean)}
                      />
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {f1.err_id}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{new Date(f1.date).toLocaleDateString()}</TableCell>
                  <TableCell className="whitespace-nowrap">{f1.state}</TableCell>
                  <TableCell className="whitespace-nowrap max-w-[100px] truncate" title={f1.locality}>{f1.locality}</TableCell>
                  <TableCell className="text-right">
                    {editingExpenses[f1.id] && canEditProject ? (
                      <div className="space-y-1">
                        {tempExpenses[f1.id]?.map((expense, index) => (
                          <div key={index} className="flex gap-1">
                            <Input
                              value={expense.activity}
                              onChange={(e) => handleExpenseChange(f1.id, index, 'activity', e.target.value)}
                              placeholder={t('projects:activity') as string}
                              className="w-28 h-7 text-xs"
                            />
                            <Input
                              type="number"
                              value={expense.total_cost}
                              onChange={(e) => handleExpenseChange(f1.id, index, 'total_cost', parseFloat(e.target.value) || 0)}
                              placeholder={t('projects:amount') as string}
                              className="w-20 h-7 text-xs"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleRemoveExpense(f1.id, index)}
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleAddExpense(f1.id)}
                          >
                            {t('projects:add_expense')}
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleSaveExpenses(f1.id)}
                          >
                            <Save className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 w-7 p-0"
                            onClick={() => handleCancelEditExpenses(f1.id)}
                          >
                            <X className="w-3 h-3" />
                          </Button>
                        </div>
                        <div className="text-xs font-medium">
                          {t('projects:total')}: {calculateTotalAmount(tempExpenses[f1.id] || []).toLocaleString()}
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <span className="font-medium whitespace-nowrap">{calculateTotalAmount(f1.expenses).toLocaleString()}</span>
                        {canEditProject && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0 min-w-6"
                            onClick={() => handleEditExpenses(f1.id)}
                            title={t('projects:edit_project') as string}
                          >
                            <Edit2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                  {/* Compliance screening status */}
                  <TableCell className="whitespace-nowrap">
                    {f1.compliance_flag_type === 'sanctions_match' && f1.compliance_blocked ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0 font-semibold" title="Potential Descartes/sanctions match — payment must be stopped">
                        PAYMENT STOPPED
                      </Badge>
                    ) : f1.compliance_blocked ? (
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0" title="Missing ID — finance must upload the document or dismiss the flag">
                        {f1.compliance_flag_type === 'missing_id' ? 'Missing ID' : 'Flagged — compliance'}
                      </Badge>
                    ) : f1.compliance_status === 'pending_screening' ? (
                      <Badge variant="secondary" className="text-muted-foreground text-[10px] px-1.5 py-0">
                        Screening pending
                      </Badge>
                    ) : f1.compliance_status === 'flagged' ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-amber-500">
                        Finance resolved
                      </Badge>
                    ) : f1.compliance_status ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0 bg-green-600">
                        Cleared
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  {/* Community Approval */}
                  <TableCell className="whitespace-nowrap">
                    <CommunityApprovalCell
                      projectId={f1.id}
                      approvalFileKey={f1.approval_file_key}
                      canUpload={canUploadApproval}
                      onUploaded={fetchUncommittedF1s}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <div className="flex items-center gap-1">
                      {canEditProject && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0"
                          onClick={() => { setEditorProjectId(f1.id); setEditorOpen(true) }}
                          title={t('projects:edit_project') as string}
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canCommit && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 w-7 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          onClick={() => handleDeleteClick(f1.id)}
                          title={t('f2:delete_project') as string}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                  {/* Status cell removed visually */}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {sortedF1s.length > itemsPerPage && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, sortedF1s.length)} of {sortedF1s.length} projects
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      <ProjectEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        projectId={editorProjectId}
        onSaved={async () => { await fetchUncommittedF1s() }}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md mx-4">
          <DialogHeader>
            <DialogTitle>{t('f2:delete_project') || 'Delete Project'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {t('f2:delete_confirmation') || 'Are you sure you want to delete this F1 project submission? This action cannot be undone.'}
            </p>
            {deletingF1Id && (() => {
              const f1 = f1s.find(f => f.id === deletingF1Id)
              if (!f1) return null
              return (
                <div className="p-3 bg-muted rounded-md">
                  <div className="font-medium">{f1.err_id}</div>
                  <div className="text-sm text-muted-foreground">
                    {f1.state} - {f1.locality}
                  </div>
                </div>
              )
            })()}
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteDialogOpen(false)
                  setDeletingF1Id(null)
                }}
                disabled={isDeleting}
              >
                {t('common:cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={handleDeleteConfirm}
                disabled={isDeleting}
              >
                {isDeleting ? t('f2:deleting') || 'Deleting...' : t('f2:delete') || 'Delete'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
