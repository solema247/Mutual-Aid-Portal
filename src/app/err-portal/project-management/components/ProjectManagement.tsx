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

type PlannedActivity = {
  duration: number
  location: string
  quantity: number
  selectedActivity: string
  expenses: {
    total: number
    expense: string
    frequency: string
    unitPrice: string
    description: string
  }[]
}

type ProjectStatus = 'new' | 'feedback' | 'active' | 'declined'

type Project = {
  id: string
  date: string
  state: string
  locality: string
  status: ProjectStatus
  language: string
  project_objectives: string
  intended_beneficiaries: string
  estimated_beneficiaries: number
  estimated_timeframe: string
  additional_support: string
  submitted_at: string
  planned_activities: PlannedActivity[]
  err_id: string
  version: number
  current_feedback_id: string | null
}

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

type ActivityName = {
  id: string
  activity_name: string
  language: string
}

type ExpenseCategory = {
  id: string
  expense_name: string
  language: string
}

interface User {
  id: string;
  name: string;
}

export default function ProjectManagement() {
  const { t } = useTranslation(['projects', 'common'])
  const [projects, setProjects] = useState<Project[]>([])
  const [allProjects, setAllProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [currentStatus, setCurrentStatus] = useState<ProjectStatus>('new')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'details' | 'feedback'>('details')
  const [feedbackHistory, setFeedbackHistory] = useState<Feedback[]>([])
  const [user, setUser] = useState<User | null>(null)
  const [activities, setActivities] = useState<ActivityName[]>([])
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([])

  const filterProjectsByStatus = useCallback(() => {
    let filteredProjects: Project[] = []
    
    switch (currentStatus) {
      case 'new':
        filteredProjects = allProjects.filter(p => ['new', 'pending'].includes(p.status))
        break
      case 'feedback':
        filteredProjects = allProjects.filter(p => p.status === 'feedback')
        break
      case 'active':
        filteredProjects = allProjects.filter(p => ['active', 'approved'].includes(p.status))
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
    fetchActivitiesAndExpenses()
  }, [])

  const fetchActivitiesAndExpenses = async () => {
    try {
      const [activitiesResult, expensesResult] = await Promise.all([
        supabase
          .from('planned_activities')
          .select('*')
          .order('activity_name', { ascending: true }),
        supabase
          .from('expense_categories')
          .select('*')
          .order('expense_name', { ascending: true })
      ])

      if (activitiesResult.error) throw activitiesResult.error
      if (expensesResult.error) throw expensesResult.error

      setActivities(activitiesResult.data || [])
      setExpenses(expensesResult.data || [])
    } catch (error) {
      console.error('Error fetching activities and expenses:', error)
    }
  }

  const getActivityName = (id: string) => {
    const activity = activities.find(a => a.id === id)
    return activity?.activity_name || id
  }

  const getExpenseName = (id: string) => {
    const expense = expenses.find(e => e.id === id)
    return expense?.expense_name || id
  }

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
      const { data, error } = await supabase
        .from('err_projects')
        .select('*')
        .order('submitted_at', { ascending: false })

      if (error) throw error
      setAllProjects(data || [])
      setLoading(false)
    } catch (error) {
      console.error('Error fetching all projects:', error)
      setLoading(false)
    }
  }

  const handleFeedbackSubmit = async (feedbackText: string, action: 'approve' | 'feedback' | 'decline') => {
    if (!selectedProject || !user) return

    try {
      const newStatus = action === 'approve' ? 'active' : 
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

  const handleProjectClick = (project: Project) => {
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
            {t('projects:status_feedback')} ({allProjects.filter(p => p.status === 'feedback').length})
          </TabsTrigger>
          <TabsTrigger value="active">
            {t('projects:status_active')} ({allProjects.filter(p => ['active', 'approved'].includes(p.status)).length})
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
                      <TableHead>{t('common:actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell>{project.err_id}</TableCell>
                        <TableCell>{formatDate(project.date)}</TableCell>
                        <TableCell>{`${project.state}, ${project.locality}`}</TableCell>
                        <TableCell>{project.version}</TableCell>
                        <TableCell>
                          <Button
                            variant="outline"
                            onClick={() => handleProjectClick(project)}
                          >
                            {t('common:view')}
                          </Button>
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
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-950">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold border-b pb-2">
                {t('projects:project_details')} - {selectedProject.err_id}
                <span className="text-sm font-normal text-slate-500 dark:text-slate-400 ml-2">
                  {t('projects:version')} {selectedProject.version}
                </span>
              </DialogTitle>
            </DialogHeader>

            <Tabs value={selectedTab} className="w-full" onValueChange={(value) => setSelectedTab(value as 'details' | 'feedback')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="details">
                  {t('projects:details_tab')}
                </TabsTrigger>
                <TabsTrigger value="feedback">
                  {t('projects:feedback_tab')}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="py-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Project Overview */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-4">{t('projects:overview')}</h3>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium text-base">{t('projects:objectives')}</h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {selectedProject.project_objectives}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-medium text-base">{t('projects:location')}</h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {selectedProject.state}, {selectedProject.locality}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-medium text-base">{t('projects:timeframe')}</h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {selectedProject.estimated_timeframe}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h3 className="text-lg font-semibold mb-4">{t('projects:beneficiaries')}</h3>
                      <div className="space-y-4">
                        <div>
                          <h4 className="font-medium text-base">{t('projects:intended_beneficiaries')}</h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {selectedProject.intended_beneficiaries}
                          </p>
                        </div>
                        <div>
                          <h4 className="font-medium text-base">{t('projects:estimated_number')}</h4>
                          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                            {selectedProject.estimated_beneficiaries}
                          </p>
                        </div>
                      </div>
                    </div>

                    {selectedProject.additional_support && (
                      <div>
                        <h3 className="text-lg font-semibold mb-4">{t('projects:additional_support')}</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300">
                          {selectedProject.additional_support}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Activities and Expenses */}
                  <div className="space-y-6">
                    <div>
                      <h3 className="text-lg font-semibold mb-4">{t('projects:planned_activities')}</h3>
                      <div className="space-y-6">
                        {selectedProject.planned_activities?.map((activity, index) => (
                          <div key={index} className="border rounded-lg p-4 space-y-3">
                            <div>
                              <h4 className="font-medium text-base">
                                {getActivityName(activity.selectedActivity)}
                              </h4>
                              <div className="grid grid-cols-3 gap-2 mt-2 text-sm">
                                <div>
                                  <span className="text-slate-500">{t('projects:duration')}:</span>
                                  <span className="ml-1">{activity.duration}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">{t('projects:quantity')}:</span>
                                  <span className="ml-1">{activity.quantity}</span>
                                </div>
                                <div>
                                  <span className="text-slate-500">{t('projects:location')}:</span>
                                  <span className="ml-1">{activity.location}</span>
                                </div>
                              </div>
                            </div>

                            <div className="border-t pt-3">
                              <h5 className="font-medium text-sm mb-2">{t('projects:expenses')}</h5>
                              <div className="space-y-2">
                                {activity.expenses.map((expense, expIndex) => (
                                  <div key={expIndex} className="text-sm">
                                    <div className="flex justify-between items-center">
                                      <span>{getExpenseName(expense.expense)}</span>
                                      <span className="font-medium">{expense.total}</span>
                                    </div>
                                    <div className="text-xs text-slate-500 mt-1">
                                      <span>{t('projects:unit_price')}: {expense.unitPrice}</span>
                                      <span className="mx-2">•</span>
                                      <span>{t('projects:frequency')}: {expense.frequency}</span>
                                    </div>
                                    {expense.description && (
                                      <p className="text-xs text-slate-600 mt-1">{expense.description}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
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
            </Tabs>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
} 