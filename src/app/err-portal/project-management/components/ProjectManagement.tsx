'use client'

import { useEffect, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'

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
  feedback?: string
  feedback_date?: string
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

export default function ProjectManagement() {
  const { t } = useTranslation(['projects', 'common'])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedProject, setSelectedProject] = useState<Project | null>(null)
  const [currentStatus, setCurrentStatus] = useState<ProjectStatus>('new')
  const [feedback, setFeedback] = useState('')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [activities, setActivities] = useState<ActivityName[]>([])
  const [expenses, setExpenses] = useState<ExpenseCategory[]>([])

  useEffect(() => {
    fetchProjects()
    fetchActivitiesAndExpenses()
  }, [currentStatus])

  const fetchActivitiesAndExpenses = async () => {
    try {
      const [activitiesResult, expensesResult] = await Promise.all([
        supabase.from('planned_activities').select('*'),
        supabase.from('expense_categories').select('*')
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

  const fetchProjects = async () => {
    try {
      let query = supabase
        .from('err_projects')
        .select('*')
        .order('submitted_at', { ascending: false })

      // For active status, include both 'active' and legacy 'approved' status
      if (currentStatus === 'active') {
        query = query.in('status', ['active', 'approved'])
      } else {
        query = query.eq('status', currentStatus)
      }

      const { data, error } = await query
      if (error) throw error

      setProjects(data || [])
    } catch (error) {
      console.error('Error fetching projects:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateProjectStatus = async (projectId: string, newStatus: ProjectStatus, feedbackText?: string) => {
    try {
      const updateData: any = { 
        status: newStatus,
      }
      
      if (feedbackText) {
        updateData.feedback = feedbackText
        updateData.feedback_date = new Date().toISOString()
      }

      const { error } = await supabase
        .from('err_projects')
        .update(updateData)
        .eq('id', projectId)

      if (error) throw error

      setFeedback('')
      setIsDialogOpen(false)
      fetchProjects()
    } catch (error) {
      console.error('Error updating project status:', error)
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString()
  }

  const handleProjectClick = (project: Project) => {
    setSelectedProject(project)
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
            {t('projects:status_new')} ({projects.filter(p => p.status === 'new').length})
          </TabsTrigger>
          <TabsTrigger value="feedback">
            {t('projects:status_feedback')} ({projects.filter(p => p.status === 'feedback').length})
          </TabsTrigger>
          <TabsTrigger value="active">
            {t('projects:status_active')} ({projects.filter(p => ['active', 'approved'].includes(p.status)).length})
          </TabsTrigger>
          <TabsTrigger value="declined">
            {t('projects:status_declined')} ({projects.filter(p => p.status === 'declined').length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={currentStatus} className="mt-6">
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
                      <TableHead>{t('projects:officer')}</TableHead>
                      <TableHead>{t('common:actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projects.map((project) => (
                      <TableRow key={project.id}>
                        <TableCell>{project.err_id}</TableCell>
                        <TableCell>{formatDate(project.date)}</TableCell>
                        <TableCell>{`${project.state}, ${project.locality}`}</TableCell>
                        <TableCell>{project.program_officer_name}</TableCell>
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
              </DialogTitle>
            </DialogHeader>
            <div className="py-6">
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

              {/* Feedback Section */}
              {selectedProject.feedback && (
                <div className="border-t mt-6 pt-4">
                  <h4 className="font-medium text-base">{t('projects:previous_feedback')}</h4>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    {selectedProject.feedback}
                    {selectedProject.feedback_date && (
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {formatDate(selectedProject.feedback_date)}
                      </span>
                    )}
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              {(currentStatus === 'new' || currentStatus === 'feedback') && (
                <div className="space-y-4 mt-8 border-t pt-6">
                  <div>
                    <h4 className="font-medium text-base mb-2">{t('projects:provide_feedback')}</h4>
                    <Textarea
                      value={feedback}
                      onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setFeedback(e.target.value)}
                      placeholder={t('projects:feedback_placeholder')}
                      className="min-h-[100px] bg-white dark:bg-slate-900"
                    />
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      onClick={() => updateProjectStatus(selectedProject.id, 'active')}
                      className="flex-1"
                    >
                      {t('projects:approve')}
                    </Button>
                    {feedback && (
                      <Button
                        onClick={() => updateProjectStatus(selectedProject.id, 'feedback', feedback)}
                        variant="outline"
                        className="flex-1"
                      >
                        {t('projects:send_feedback')}
                      </Button>
                    )}
                    <Button
                      onClick={() => updateProjectStatus(selectedProject.id, 'declined', feedback)}
                      variant="destructive"
                      className="flex-1"
                    >
                      {t('projects:decline')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  )
} 