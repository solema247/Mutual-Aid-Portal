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

type ProjectStatus = 'new' | 'feedback' | 'assignment' | 'declined' | 'draft' | 'pending' | 'approved'

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
  const [selectedTab, setSelectedTab] = useState<'details' | 'feedback'>('details')
  const [feedbackHistory, setFeedbackHistory] = useState<Feedback[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [grantCalls, setGrantCalls] = useState<any[]>([])
  const [grantSerials, setGrantSerials] = useState<any[]>([])
  const [selectedGrantCall, setSelectedGrantCall] = useState<string>('')
  const [selectedGrantSerial, setSelectedGrantSerial] = useState<string>('')

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
      case 'assignment':
        filteredProjects = allProjects.filter(p => 
          p.status === 'approved' && 
          (!p.grant_serial_id || p.funding_status === 'unassigned')
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
    fetchGrantCalls()
  }, [])

  useEffect(() => {
    if (selectedGrantCall) {
      fetchGrantSerials(selectedGrantCall)
    } else {
      setGrantSerials([])
    }
  }, [selectedGrantCall])

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

      // Get unique emergency room IDs and grant call IDs
      const emergencyRoomIds = [...new Set(projectsData?.map(p => p.emergency_room_id).filter(Boolean) || [])]
      const grantCallIds = [...new Set(projectsData?.map(p => p.grant_call_id).filter(Boolean) || [])]

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

      // Fetch grant calls data
      let grantCallsData: any[] = []
      if (grantCallIds.length > 0) {
        const { data: gcData, error: gcError } = await supabase
          .from('grant_calls')
          .select('id, name, shortname')
          .in('id', grantCallIds)
        
        if (!gcError) {
          grantCallsData = gcData || []
        }
      }

      // Combine the data
      const combinedData = projectsData?.map(project => ({
        ...project,
        emergency_rooms: emergencyRoomsData.find(err => err.id === project.emergency_room_id) || null,
        grant_calls: grantCallsData.find(gc => gc.id === project.grant_call_id) || null
      })) || []

      setAllProjects(combinedData)
      setLoading(false)
    } catch (error) {
      console.error('Error fetching all projects:', error)
      setLoading(false)
    }
  }

  const fetchGrantCalls = async () => {
    try {
      const { data, error } = await supabase
        .from('grant_calls')
        .select('id, name, shortname')
        .eq('status', 'open')
        .order('created_at', { ascending: false })

      if (error) throw error
      setGrantCalls(data || [])
    } catch (error) {
      console.error('Error fetching grant calls:', error)
    }
  }

  const fetchGrantSerials = async (grantCallId: string) => {
    try {
      const { data, error } = await supabase
        .from('grant_serials')
        .select('grant_serial, grant_call_id, state_name, yymm')
        .eq('grant_call_id', grantCallId)
        .order('created_at', { ascending: false })

      if (error) throw error
      setGrantSerials(data || [])
    } catch (error) {
      console.error('Error fetching grant serials:', error)
    }
  }

  const handleGrantAssignment = async (projectId: string, grantSerial: string) => {
    try {
      const { error } = await supabase
        .from('err_projects')
        .update({
          grant_serial_id: grantSerial,
          funding_status: 'allocated'
        })
        .eq('id', projectId)

      if (error) throw error

      // Refresh projects list
      fetchAllProjects()
      alert('Project assigned to grant serial successfully!')
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

  if (loading) {
    return <div className="text-center">{t('common:loading')}</div>
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="new" className="w-full" onValueChange={(value) => setCurrentStatus(value as ProjectStatus)}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="new">
            {t('projects:status_new')} ({allProjects.filter(p => ['new', 'pending'].includes(p.status)).length})
          </TabsTrigger>
          <TabsTrigger value="feedback">
            {t('projects:status_feedback')} ({allProjects.filter(p => 
              p.status === 'feedback' || 
              (p.status === 'draft' && p.current_feedback_id !== null)
            ).length})
          </TabsTrigger>
          <TabsTrigger value="assignment">
            {t('projects:status_assignment')} ({allProjects.filter(p => 
              p.status === 'approved' && 
              (!p.grant_serial_id || p.funding_status === 'unassigned')
            ).length})
          </TabsTrigger>
          <TabsTrigger value="declined">
            {t('projects:status_declined')} ({allProjects.filter(p => p.status === 'declined').length})
          </TabsTrigger>
        </TabsList>

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
                      <TableHead>{t('projects:err_id')}</TableHead>
                      <TableHead>{t('projects:date')}</TableHead>
                      <TableHead>{t('projects:location')}</TableHead>
                      <TableHead>{t('projects:version')}</TableHead>
                                             <TableHead>{t('projects:grant_call')}</TableHead>
                       <TableHead>{t('projects:grant_serial')}</TableHead>
                       <TableHead>{t('projects:funding_status')}</TableHead>
                       <TableHead>{t('projects:actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                                                 <TableCell>{project.emergency_rooms?.err_code || project.err_id || '-'}</TableCell>
                         <TableCell>{formatDate(project.date)}</TableCell>
                         <TableCell>{`${project.state}, ${project.locality}`}</TableCell>
                         <TableCell>{project.version}</TableCell>
                         <TableCell>{project.grant_calls?.name || project.grant_call_id || '-'}</TableCell>
                         <TableCell>{project.grant_serial_id || '-'}</TableCell>
                         <TableCell>{t(`projects:status.${project.funding_status}`)}</TableCell>
                        <TableCell>
                          {currentStatus === 'assignment' ? (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleProjectClick(project)}
                              >
                                {t('common:view')}
                              </Button>
                              <Button
                                variant="default"
                                size="sm"
                                onClick={() => {
                                  setSelectedProject(project)
                                  setSelectedTab('assignment')
                                  setIsDialogOpen(true)
                                }}
                              >
                                {t('projects:assign_grant')}
                              </Button>
                            </div>
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

            <Tabs value={selectedTab} className="w-full" onValueChange={(value) => setSelectedTab(value as 'details' | 'feedback' | 'assignment')}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">
                  {t('projects:details_tab')}
                </TabsTrigger>
                <TabsTrigger value="feedback">
                  {t('projects:feedback_tab')}
                </TabsTrigger>
                {currentStatus === 'assignment' && (
                  <TabsTrigger value="assignment">
                    {t('projects:assignment_tab')}
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

              <TabsContent value="assignment" className="py-6">
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-semibold mb-4">{t('projects:assign_grant_serial')}</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      {t('projects:assign_grant_serial_desc')}
                    </p>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">
                          {t('projects:select_grant_call')}
                        </label>
                        <select
                          value={selectedGrantCall}
                          onChange={(e) => setSelectedGrantCall(e.target.value)}
                          className="w-full p-2 border rounded-md"
                        >
                          <option value="">{t('projects:select_grant_call_placeholder')}</option>
                          {grantCalls.map((grantCall) => (
                            <option key={grantCall.id} value={grantCall.id}>
                              {grantCall.name} ({grantCall.shortname})
                            </option>
                          ))}
                        </select>
                      </div>

                      {selectedGrantCall && (
                        <div>
                          <label className="block text-sm font-medium mb-2">
                            {t('projects:select_grant_serial')}
                          </label>
                          <select
                            value={selectedGrantSerial}
                            onChange={(e) => setSelectedGrantSerial(e.target.value)}
                            className="w-full p-2 border rounded-md"
                          >
                            <option value="">{t('projects:select_grant_serial_placeholder')}</option>
                            {grantSerials.map((serial) => (
                              <option key={serial.grant_serial} value={serial.grant_serial}>
                                {serial.grant_serial} - {serial.state_name} ({serial.yymm})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {selectedGrantSerial && (
                        <div className="pt-4">
                          <Button
                            onClick={() => handleGrantAssignment(selectedProject.id, selectedGrantSerial)}
                            className="w-full"
                          >
                            {t('projects:assign_project')}
                          </Button>
                        </div>
                      )}
                    </div>
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
