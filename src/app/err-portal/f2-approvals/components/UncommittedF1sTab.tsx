'use client'

import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/lib/supabaseClient'
import { cn } from '@/lib/utils'
import { Edit2, Save, X, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import ProjectEditor from './ProjectEditor'
import type { UncommittedF1, GrantCallOption } from '../types'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'

export default function UncommittedF1sTab() {
  const { t, i18n } = useTranslation(['f2', 'common'])
  const { can } = useAllowedFunctions()
  const canCommit = can('f2_commit')
  const canUploadApproval = can('f2_upload_approval')
  const canEditProject = can('f2_edit_project')
  const searchParams = useSearchParams()
  const [f1s, setF1s] = useState<UncommittedF1[]>([])
  const [grantCalls, setGrantCalls] = useState<GrantCallOption[]>([])
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

  useEffect(() => {
    fetchUncommittedF1s()
    fetchGrantCalls()
    
    // Check for editProjectId in URL query params
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
      setCurrentPage(1) // Reset to first page when data refreshes
    } catch (error) {
      console.error('Error fetching uncommitted F1s:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const fetchGrantCalls = async () => {
    try {
      const response = await fetch('/api/f2/grant-calls')
      if (!response.ok) throw new Error('Failed to fetch grant calls')
      const data = await response.json()
      setGrantCalls(data)
    } catch (error) {
      console.error('Error fetching grant calls:', error)
    }
  }


  const calculateTotalAmount = (expenses: Array<{ activity: string; total_cost: number }>) => {
    return expenses.reduce((sum, exp) => sum + (exp.total_cost || 0), 0)
  }

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedF1s(f1s.map(f1 => f1.id))
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
        alert('Failed to commit F1s')
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

  const totalPages = Math.ceil(f1s.length / itemsPerPage)
  const startIndex = (currentPage - 1) * itemsPerPage
  const endIndex = startIndex + itemsPerPage
  const paginatedF1s = f1s.slice(startIndex, endIndex)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">{t('f2:uncommitted_header', { count: f1s.length })}</h3>
          <p className="text-sm text-muted-foreground">{t('f2:uncommitted_desc')}</p>
        </div>
        <div className="flex gap-2">
          {canCommit && (
            <Button
              onClick={handleCommitSelected}
              disabled={selectedF1s.length === 0 || isCommitting}
            >
              {isCommitting ? t('f2:committing') : t('f2:commit_selected', { count: selectedF1s.length })}
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table dir={i18n.language === 'ar' ? 'rtl' : 'ltr'} className="text-xs min-w-[700px]">
            <TableHeader>
              <TableRow className="[&>th]:py-2 [&>th]:px-2 [&>th]:text-xs">
                <TableHead className="w-10 px-2">
                  {canCommit && (
                    <Checkbox
                      checked={selectedF1s.length === f1s.length && f1s.length > 0}
                      onCheckedChange={handleSelectAll}
                    />
                  )}
                </TableHead>
                <TableHead className="px-2">{t('f2:err_id')}</TableHead>
                <TableHead className="px-2">{t('f2:date') || 'Date'}</TableHead>
                <TableHead className="px-2">{t('f2:state')}</TableHead>
                <TableHead className="px-2">{t('f2:locality')}</TableHead>
                <TableHead className="text-right px-2">{t('f2:requested_amount')}</TableHead>
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
                  {/* Community Approval */}
                  <TableCell className="whitespace-nowrap">
                    {f1.approval_file_key ? (
                      <Badge variant="default" className="text-[10px] px-1.5 py-0">{t('f2:approval_uploaded')}</Badge>
                    ) : canUploadApproval ? (
                      <div className="flex items-center gap-1">
                        <Badge variant="secondary" className="text-muted-foreground text-[10px] px-1.5 py-0">{t('f2:approval_required')}</Badge>
                        <input
                          id={`approval-file-${f1.id}`}
                          type="file"
                          className="hidden"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            try {
                              // Build path for approval file (no grant assignment needed)
                              const key = `f2-approvals/${f1.id}/${Date.now()}-${file.name.replace(/\s+/g,'_')}`
                              const { error: upErr } = await supabase.storage.from('images').upload(key, file, { upsert: true })
                              if (upErr) { alert(t('f2:upload_failed')); return }
                              const resp = await fetch('/api/f2/uncommitted', {
                                method: 'PATCH',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ id: f1.id, approval_file_key: key })
                              })
                              if (!resp.ok) { alert(t('f2:upload_failed')); return }
                              await fetchUncommittedF1s()
                            } catch (err) {
                              console.error('Upload error', err)
                              alert(t('f2:upload_failed'))
                            }
                          }}
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2"
                          onClick={() => document.getElementById(`approval-file-${f1.id}`)?.click()}
                        >
                          {t('f2:upload')}
                        </Button>
                      </div>
                    ) : (
                      <Badge variant="secondary" className="text-muted-foreground text-[10px] px-1.5 py-0">{t('f2:approval_required')}</Badge>
                    )}
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
      {f1s.length > itemsPerPage && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            Showing {startIndex + 1} to {Math.min(endIndex, f1s.length)} of {f1s.length} projects
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
