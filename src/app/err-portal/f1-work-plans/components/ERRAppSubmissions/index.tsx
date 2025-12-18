'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabaseClient'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import FeedbackHistory from './FeedbackHistory'
import FeedbackForm from './FeedbackForm'
import ProjectDetails from './ProjectDetails'
import { F1Project } from '../../types'
import type { FundingCycle } from '@/types/cycles'

type ProjectStatus = 'new' | 'feedback' | 'staging' | 'declined' | 'draft' | 'pending' | 'approved'

type Feedback = {
  id: string
  feedback_text: string
  feedback_status: 'pending_changes' | 'changes_submitted' | 'resolved'
  created_by: string
  addressed_by: string | null
  created_at: string
  addressed_at: string | null
  iteration_number: number
}

interface User {
  id: string;
  name: string;
}

export default function ERRAppSubmissions() {
  const { t } = useTranslation(['f1_plans', 'projects', 'common'])
  const [projects, setProjects] = useState<F1Project[]>([])
  const [allProjects, setAllProjects] = useState<F1Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<F1Project | null>(null)
  const [currentStatus, setCurrentStatus] = useState<ProjectStatus>('new')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'details' | 'feedback' | 'staging'>('details')
  const [feedbackHistory, setFeedbackHistory] = useState<Feedback[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [fundingCycles, setFundingCycles] = useState<FundingCycle[]>([])
  const [grantSerials, setGrantSerials] = useState<any[]>([])
  const [selectedFundingCycle, setSelectedFundingCycle] = useState<string>('')
  const [selectedGrantSerial, setSelectedGrantSerial] = useState<string>('')
  const [isCreatingSerial, setIsCreatingSerial] = useState<boolean>(false)
  const [isAssigningGrant, setIsAssigningGrant] = useState<boolean>(false)
  const [selectedRows, setSelectedRows] = useState<Record<string, boolean>>({})

  const filterProjectsByStatus = useCallback(() => {
    let filteredProjects: F1Project[] = []
    
    switch (currentStatus) {
      case 'new':
        filteredProjects = allProjects.filter(p => ['new', 'pending'].includes(p.status))
        break
      case 'feedback':
        filteredProjects = allProjects.filter(p => 
          p.status === 'feedback' || 
          (p.status === 'draft' && p.current_feedback_id !== null)
        )
        break
      case 'staging':
        filteredProjects = allProjects.filter(p => 
          p.status === 'approved' && 
          (p.funding_status?.toLowerCase?.() === 'unassigned')
        )
        break
      case 'declined':
        filteredProjects = allProjects.filter(p => p.status === 'declined')
        break
    }

    setProjects(filteredProjects)
  }, [currentStatus, allProjects])

  useEffect(() => {
    const userData = localStorage.getItem('user')
    if (userData) {
      setUser(JSON.parse(userData))
    }
  }, [])

  useEffect(() => {
    fetchAllProjects()
  }, [])

  useEffect(() => {
    if (allProjects.length > 0) {
      filterProjectsByStatus()
    }
  }, [currentStatus, allProjects, filterProjectsByStatus])

  useEffect(() => {
    if (selectedProject) {
      fetchFeedbackHistory(selectedProject.id)
    }
  }, [selectedProject])

  useEffect(() => {
    fetchFundingCycles()
  }, [])

  useEffect(() => {
    if (selectedFundingCycle) {
      fetchGrantSerials(selectedFundingCycle)
    } else {
      setGrantSerials([])
    }
  }, [selectedFundingCycle])


  // When opening a project in Staging tab, preselect the project's funding cycle
  useEffect(() => {
    if (isDialogOpen && selectedTab === 'staging' && selectedProject?.funding_cycle_id) {
      setSelectedFundingCycle(selectedProject.funding_cycle_id)
    }
  }, [isDialogOpen, selectedTab, selectedProject])

  const fetchFeedbackHistory = async (projectId: string) => {
    try {
      const { data, error } = await supabase
        .from('project_feedback')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: true })

      if (error) throw error
      setFeedbackHistory(data || [])
    } catch (error) {
      console.error('Error fetching feedback history:', error)
    }
  }

  const fetchAllProjects = async () => {
    try {
      // First fetch projects
      const { data: projectsData, error: projectsError } = await supabase
        .from('err_projects')
        .select('*')
        .or('source.is.null,source.neq.mutual_aid_portal')
        .order('submitted_at', { ascending: false })

      if (projectsError) throw projectsError

      // Get unique emergency room IDs and funding cycle IDs
      const emergencyRoomIds = [...new Set(projectsData?.map(p => p.emergency_room_id).filter(Boolean) || [])]
      const fundingCycleIds = [...new Set(projectsData?.map(p => p.funding_cycle_id).filter(Boolean) || [])]

      // Fetch emergency rooms data
      let emergencyRoomsData: any[] = []
      if (emergencyRoomIds.length > 0) {
        const { data: errData, error: errError } = await supabase
          .from('emergency_rooms')
          .select('id, name, name_ar, err_code')
          .in('id', emergencyRoomIds)
        
        if (!errError) {
          emergencyRoomsData = errData || []
        }
      }

      // Fetch funding cycles data
      let fundingCyclesData: any[] = []
      if (fundingCycleIds.length > 0) {
        const { data: fcData, error: fcError } = await supabase
          .from('funding_cycles')
          .select('id, name, cycle_number')
          .in('id', fundingCycleIds)
        
        if (!fcError) {
          fundingCyclesData = fcData || []
        }
      }

      // Combine the data
      const combinedData = projectsData?.map(project => ({
        ...project,
        emergency_rooms: emergencyRoomsData.find(err => err.id === project.emergency_room_id) || null,
        funding_cycles: fundingCyclesData.find(fc => fc.id === project.funding_cycle_id) || null
      })) || []

      setAllProjects(combinedData)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching all projects:', error)
      setLoading(false)
    }
  }

  const fetchFundingCycles = async () => {
    try {
      const { data, error } = await supabase
        .from('funding_cycles')
        .select('id, name, cycle_number, start_date, year, status, end_date, created_at, created_by')
        .eq('status', 'open')
        .order('cycle_number', { ascending: false })

      if (error) throw error
      // Narrow to the fields we actually use and satisfy FundingCycle type
      const mapped = (data || []).map((fc: any) => ({
        id: fc.id,
        name: fc.name,
        cycle_number: fc.cycle_number,
        year: fc.year ?? new Date(fc.start_date || Date.now()).getFullYear(),
        status: fc.status,
        start_date: fc.start_date || null,
        end_date: fc.end_date || null,
        // The following fields exist in the type but are not used in UI; include from response if present
        created_at: fc.created_at ?? null,
        created_by: fc.created_by ?? null
      }))
      setFundingCycles(mapped)
    } catch (error) {
      console.error('Error fetching funding cycles:', error)
    }
  }

  const getCycleYYMM = async (fundingCycleId: string): Promise<string> => {
    // Derive YYMM from the funding cycle start_date
    const { data, error } = await supabase
      .from('funding_cycles')
      .select('start_date')
      .eq('id', fundingCycleId)
      .single()

    if (error || !data?.start_date) {
      // Fallback to current date if start_date is missing
      const now = new Date()
      const yy = String(now.getFullYear()).slice(-2)
      const mm = String(now.getMonth() + 1).padStart(2, '0')
      return `${mm}${yy}`
    }

    const start = new Date(data.start_date)
    const yy = String(start.getFullYear()).slice(-2)
    const mm = String(start.getMonth() + 1).padStart(2, '0')
    return `${mm}${yy}`
  }

  const handleCreateSerialForProject = async () => {
    if (!selectedProject?.funding_cycle_id || !selectedProject?.cycle_state_allocation_id) {
      alert('Project is missing cycle information.')
      return
    }

    try {
      setIsCreatingSerial(true)

      // Derive YYMM from cycle
      const yymm = await getCycleYYMM(selectedProject.funding_cycle_id)

      // Create serial using cycle-based params
      const resp = await fetch('/api/fsystem/grant-serials/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          funding_cycle_id: selectedProject.funding_cycle_id,
          cycle_state_allocation_id: selectedProject.cycle_state_allocation_id,
          state_name: selectedProject.state,
          yymm
        })
      })

      if (!resp.ok) {
        const msg = await resp.json().catch(() => ({}))
        throw new Error(msg?.error || 'Failed to create grant serial')
      }

      const newSerial = await resp.json()

      // Ensure grant_workplan_seq exists and increment workplan number
      const { data: seqData, error: seqError } = await supabase
        .from('grant_workplan_seq')
        .select('last_workplan_number')
        .eq('grant_serial', newSerial.grant_serial)
        .single()

      if (seqError && seqError.code !== 'PGRST116') {
        throw seqError
      }

      const nextWorkplanNumber = seqData ? seqData.last_workplan_number + 1 : 1

      if (seqData) {
        const { error: updateSeqError } = await supabase
          .from('grant_workplan_seq')
          .update({ last_workplan_number: nextWorkplanNumber, last_used: new Date().toISOString() })
          .eq('grant_serial', newSerial.grant_serial)
        if (updateSeqError) throw updateSeqError
      } else {
        const { error: insertSeqError } = await supabase
          .from('grant_workplan_seq')
          .insert({ grant_serial: newSerial.grant_serial, last_workplan_number: nextWorkplanNumber, last_used: new Date().toISOString(), funding_cycle_id: selectedProject.funding_cycle_id })
        if (insertSeqError) throw insertSeqError
      }

      // Update project with serial and allocation status
      const { error: updError } = await supabase
        .from('err_projects')
        .update({ grant_serial_id: newSerial.grant_serial, workplan_number: nextWorkplanNumber, funding_status: 'allocated' })
        .eq('id', selectedProject.id)
      if (updError) throw updError

      // Refresh lists and UI state
      await fetchAllProjects()
      if (selectedProject.funding_cycle_id) {
        await fetchGrantSerials(selectedProject.funding_cycle_id)
      }
      setSelectedGrantSerial(newSerial.grant_serial)
      alert(`Serial created and assigned. Workplan #${nextWorkplanNumber}`)
    } catch (e) {
      console.error('Error creating serial for project:', e)
      alert('Error creating serial. Please try again.')
    } finally {
      setIsCreatingSerial(false)
    }
  }

  const fetchGrantSerials = async (fundingCycleId: string) => {
    try {
      const { data, error } = await supabase
        .from('grant_serials')
        .select('grant_serial, funding_cycle_id, state_name, yymm')
        .eq('funding_cycle_id', fundingCycleId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setGrantSerials(data || [])
    } catch (error) {
      console.error('Error fetching grant serials:', error)
    }
  }

  const handleGrantAssignment = async (projectId: string, grantSerial: string) => {
    try {
      // First, get the next workplan number for this grant serial
      const { data: seqData, error: seqError } = await supabase
        .from('grant_workplan_seq')
        .select('last_workplan_number')
        .eq('grant_serial', grantSerial)
        .single()

      if (seqError && seqError.code !== 'PGRST116') { // PGRST116 is "not found"
        throw seqError
      }

      const nextWorkplanNumber = seqData ? seqData.last_workplan_number + 1 : 1

      // Update or insert the workplan sequence
      if (seqData) {
        const { error: updateSeqError } = await supabase
          .from('grant_workplan_seq')
          .update({
            last_workplan_number: nextWorkplanNumber,
            last_used: new Date().toISOString()
          })
          .eq('grant_serial', grantSerial)

        if (updateSeqError) throw updateSeqError
      } else {
        const { error: insertSeqError } = await supabase
          .from('grant_workplan_seq')
          .insert({
            grant_serial: grantSerial,
            last_workplan_number: nextWorkplanNumber,
            last_used: new Date().toISOString()
          })

        if (insertSeqError) throw insertSeqError
      }

      // Now update the project with grant serial, funding status, and workplan number
      const { error } = await supabase
        .from('err_projects')
        .update({
          grant_serial_id: grantSerial,
          funding_status: 'allocated',
          workplan_number: nextWorkplanNumber
        })
        .eq('id', projectId)

      if (error) throw error

      // Refresh projects list
      fetchAllProjects()
      alert(`Project assigned to grant serial successfully! Workplan number: ${nextWorkplanNumber}`)
    } catch (error) {
      console.error('Error assigning project to grant serial:', error)
      alert('Error assigning project to grant serial. Please try again.')
    }
  }

  const handleFeedbackSubmit = async (feedbackText: string, action: 'approve' | 'feedback' | 'decline') => {
    if (!selectedProject || !user) return

    try {
      const newStatus = action === 'approve' ? 'approved' : 
                       action === 'decline' ? 'declined' : 
                       'feedback'
      
      const { data: feedbackData, error: feedbackError } = await supabase
        .from('project_feedback')
        .insert({
          project_id: selectedProject.id,
          feedback_text: feedbackText,
          feedback_status: action === 'approve' ? 'resolved' : 'pending_changes',
          created_by: user.id,
          iteration_number: feedbackHistory.length + 1
        })
        .select()
        .single()

      if (feedbackError) throw feedbackError

      const { error: projectError } = await supabase
        .from('err_projects')
        .update({
          status: newStatus,
          current_feedback_id: feedbackData.id,
          version: selectedProject.version + 1
        })
        .eq('id', selectedProject.id)

      if (projectError) throw projectError

      setIsDialogOpen(false)
      fetchAllProjects()
    } catch (error) {
      console.error('Error submitting feedback:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const handleProjectClick = (project: F1Project) => {
    setSelectedProject(project)
    setSelectedTab('details')
    setIsDialogOpen(true)
  }


  // Update proposal display when selected rows change
  useEffect(() => {
    // Calculate total amount by state for all selected projects
    const amountsByState = new Map<string, number>()
    
    Object.keys(selectedRows).forEach(projectId => {
      if (selectedRows[projectId]) {
        const project = projects.find(p => p.id === projectId)
        if (project) {
          try {
            const expenses = typeof (project as any).expenses === 'string' ? JSON.parse((project as any).expenses) : (project as any).expenses
            const amount = (expenses || []).reduce((s: number, e: any) => s + (e.total_cost || 0), 0)
            const state = project.state || 'Unknown'
            amountsByState.set(state, (amountsByState.get(state) || 0) + amount)
          } catch {}
        }
      }
    })

    // Emit proposal events for each state (PoolDashboard shows one at a time, so we'll show the first state with projects)
    // For simplicity, we'll aggregate all states into a single event showing the total
    // The UI will show the impact state by state as projects are selected
    if (amountsByState.size > 0) {
      // Get the first state (or we could show the largest one)
      const firstState = Array.from(amountsByState.keys())[0]
      const totalAmount = Array.from(amountsByState.values()).reduce((sum, amt) => sum + amt, 0)
      // For now, show the first state's total. In a more sophisticated version, we'd track all states
      window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { state: firstState, amount: totalAmount } }))
    } else {
      // Clear proposals when nothing is selected
      window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { amount: 0 } }))
    }
  }, [selectedRows, projects])

  // Stage project (just checkbox selection, no grant call)
  const handleStageToggle = (project: F1Project, checked: boolean) => {
    if (checked) {
      setSelectedRows(prev => ({ ...prev, [project.id]: true }))
    } else {
      setSelectedRows(prev => {
        const copy = { ...prev }
        delete copy[project.id]
        return copy
      })
    }
  }

  // Move staged projects to F2 Uncommitted List
  const handleMoveToF2 = async () => {
    const selectedProjectIds = Object.keys(selectedRows).filter(pid => selectedRows[pid])
    if (selectedProjectIds.length === 0) {
      alert('Please select at least one project to move to F2.')
      return
    }

    try {
      setIsAssigningGrant(true)
      
      // Update status to 'pending' (which makes them appear in F2 Uncommitted List)
      // Do NOT set grant_call_id or funding_status - that happens in F2
      const { error } = await supabase
        .from('err_projects')
        .update({ status: 'pending' })
        .in('id', selectedProjectIds)

      if (error) throw error

      // Clear proposals
      try {
        window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { amount: 0 } }))
        window.dispatchEvent(new CustomEvent('pool-refresh'))
      } catch {}

      // Clear staging
      setSelectedRows({})

      await fetchAllProjects()
      alert(`Successfully moved ${selectedProjectIds.length} project(s) to F2 Uncommitted List.`)
    } catch (error) {
      console.error('Error moving projects to F2:', error)
      alert('Error moving projects to F2. Please try again.')
    } finally {
      setIsAssigningGrant(false)
    }
  }

  if (loading) {
    return <div className="text-center">{t('common:loading')}</div>
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="new" className="w-full" onValueChange={(value) => setCurrentStatus(value as ProjectStatus)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="new">
            {t('f1_plans:err_tabs.new')} ({allProjects.filter(p => ['new', 'pending'].includes(p.status)).length})
          </TabsTrigger>
          <TabsTrigger value="feedback">
            {t('f1_plans:err_tabs.feedback')} ({allProjects.filter(p => 
              p.status === 'feedback' || 
              (p.status === 'draft' && p.current_feedback_id !== null)
            ).length})
          </TabsTrigger>
          <TabsTrigger value="declined">
            {t('f1_plans:err_tabs.declined')} ({allProjects.filter(p => p.status === 'declined').length})
          </TabsTrigger>
          <TabsTrigger value="staging">
            {t('f1_plans:err_tabs.staging')} ({allProjects.filter(p => 
              p.status === 'approved' && p.funding_status?.toLowerCase?.() === 'unassigned'
            ).length})
          </TabsTrigger>
        </TabsList>

        {/* Quick refresh for ERR App Submissions */}
        <div className="flex justify-end mt-3">
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAllProjects}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('common:refresh')}
          </Button>
        </div>

        {/* Tab descriptions */}
        <div className="text-sm text-muted-foreground mt-3">
          {currentStatus === 'new' && (
            <span>{t('projects:explainers.new')}</span>
          )}
          {currentStatus === 'feedback' && (
            <span>{t('projects:explainers.feedback')}</span>
          )}
          {currentStatus === 'declined' && (
            <span>{t('projects:explainers.declined')}</span>
          )}
          {currentStatus === 'staging' && (
            <span>{t('projects:explainers.staging')}</span>
          )}
        </div>

        <TabsContent value={currentStatus}>
          <Card>
            <CardHeader>
              <CardTitle>
                {t(`projects:${currentStatus}_projects`)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {projects.length === 0 ? (
                <p className="text-center text-muted-foreground py-4">
                  {t('projects:no_projects')}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      {currentStatus === 'staging' && <TableHead><input type="checkbox" className="h-4 w-4" onChange={(e) => {
                        const checked = e.target.checked
                        const next: Record<string, boolean> = {}
                        projects.forEach(p => {
                          next[p.id] = checked
                        })
                        setSelectedRows(next)
                      }} /></TableHead>}
                      <TableHead>{t('projects:err_id')}</TableHead>
                      <TableHead>{t('projects:date')}</TableHead>
                      <TableHead>{t('projects:location')}</TableHead>
                      <TableHead>{t('projects:version')}</TableHead>
                      <TableHead>{t('projects:funding_cycle')}</TableHead>
                      <TableHead>{t('projects:funding_status')}</TableHead>
                      <TableHead>{t('projects:actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        {currentStatus === 'staging' && (
                          <TableCell>
                            <input 
                              type="checkbox" 
                              className="h-4 w-4" 
                              checked={!!selectedRows[project.id]} 
                              onChange={(e) => handleStageToggle(project, e.target.checked)} 
                            />
                          </TableCell>
                        )}
                        <TableCell>{project.emergency_rooms?.err_code || project.err_id || '-'}</TableCell>
                        <TableCell>{formatDate(project.date)}</TableCell>
                        <TableCell>{`${project.state}, ${project.locality}`}</TableCell>
                        <TableCell>{project.version}</TableCell>
                        <TableCell>{project.funding_cycles?.name || project.funding_cycle_id || '-'}</TableCell>
                        <TableCell>{t(`projects:status.${project.funding_status}`)}</TableCell>
                        <TableCell>
                          {currentStatus === 'staging' ? (
                            selectedRows[project.id] && (
                              <span className="text-xs text-muted-foreground">{t('projects:staging_selected')}</span>
                            )
                          ) : (
                            <Button
                              variant="outline"
                              onClick={() => handleProjectClick(project)}
                            >
                              {t('common:view')}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
            {currentStatus === 'staging' && (
              <div className="p-4 flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => { 
                  setSelectedRows({})
                  try { window.dispatchEvent(new CustomEvent('f1-proposal', { detail: { amount: 0 } })) } catch {} 
                }}>
                  {t('projects:clear_staging')}
                </Button>
                <Button onClick={handleMoveToF2} disabled={isAssigningGrant || Object.keys(selectedRows).filter(k => selectedRows[k]).length === 0}>
                  {isAssigningGrant ? t('common:loading') : t('projects:move_to_f2')}
                </Button>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        {selectedProject && (
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
                             <DialogTitle className="text-xl font-bold border-b pb-2">
                 {t('projects:project_details')} - {selectedProject.emergency_rooms?.err_code || selectedProject.err_id}
                 <span className="text-sm font-normal text-muted-foreground ml-2">
                   {t('projects:version')} {selectedProject.version}
                 </span>
               </DialogTitle>
            </DialogHeader>

            <Tabs value={selectedTab} className="w-full" onValueChange={(value) => setSelectedTab(value as 'details' | 'feedback' | 'staging')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">
                  {t('projects:details_tab')}
                </TabsTrigger>
                <TabsTrigger value="feedback">
                  {t('projects:feedback_tab')}
                </TabsTrigger>
                {currentStatus === 'staging' && (
                  <TabsTrigger value="staging">
                    {t('projects:staging_tab')}
                  </TabsTrigger>
                )}
              </TabsList>

              <TabsContent value="details" className="py-6">
                <ProjectDetails project={selectedProject} />
              </TabsContent>

              <TabsContent value="feedback" className="py-6">
                <div className="space-y-6">
                  <FeedbackHistory
                    projectId={selectedProject.id}
                    feedbackHistory={feedbackHistory}
                  />

                  {(currentStatus === 'new' || currentStatus === 'feedback') && (
                    <div className="border-t pt-6">
                      <FeedbackForm
                        projectId={selectedProject.id}
                        onSubmit={handleFeedbackSubmit}
                      />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="staging" className="py-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Project Staging</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      This project has been approved and is ready to be moved to F2 Uncommitted List. Grant allocation will occur in F2.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Use the staging list to select multiple projects and preview their budget impact in the "By State" view above before moving them to F2.
                    </p>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
}
