import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { Plus, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Expense {
  activity: string;
  total_cost: number;
}

interface ExtractedData {
  date: string | null;
  state: string | null;
  locality: string | null;
  project_objectives: string | null;
  intended_beneficiaries: string | null;
  estimated_beneficiaries: number | null;
  estimated_timeframe: string | null;
  additional_support: string | null;
  banking_details: string | null;
  program_officer_name: string | null;
  program_officer_phone: string | null;
  reporting_officer_name: string | null;
  reporting_officer_phone: string | null;
  finance_officer_name: string | null;
  finance_officer_phone: string | null;
  planned_activities: string[];
  expenses: Expense[];
  language: 'ar' | 'en' | null;
}

interface ExtractedDataReviewProps {
  data: ExtractedData;
  onConfirm: (editedData: ExtractedData) => void;
  onCancel: () => void;
}

export default function ExtractedDataReview({
  data,
  onConfirm,
  onCancel
}: {
  data: ExtractedData;
  onConfirm: (data: ExtractedData) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation(['common', 'err'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Initialize state with empty arrays for activities and expenses
  const [editedData, setEditedData] = useState<ExtractedData>({
    date: data.date || null,
    state: data.state || null,
    locality: data.locality || null,
    project_objectives: data.project_objectives || null,
    intended_beneficiaries: data.intended_beneficiaries || null,
    estimated_beneficiaries: data.estimated_beneficiaries || null,
    estimated_timeframe: data.estimated_timeframe || null,
    additional_support: data.additional_support || null,
    banking_details: data.banking_details || null,
    program_officer_name: data.program_officer_name || null,
    program_officer_phone: data.program_officer_phone || null,
    reporting_officer_name: data.reporting_officer_name || null,
    reporting_officer_phone: data.reporting_officer_phone || null,
    finance_officer_name: data.finance_officer_name || null,
    finance_officer_phone: data.finance_officer_phone || null,
    planned_activities: Array.isArray(data.planned_activities) ? data.planned_activities : [],
    expenses: Array.isArray(data.expenses) ? data.expenses.map(exp => ({
      activity: exp.activity || '',
      total_cost: typeof exp.total_cost === 'number' ? exp.total_cost : 0
    })) : [],
    language: data.language || null
  })

  const handleInputChange = (field: keyof ExtractedData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }))
  }

  const handlePlannedActivitiesChange = (value: string) => {
    try {
      // Try to parse as JSON if it's a string representation of an array
      const activities = value.startsWith('[') ? JSON.parse(value) : value.split('\n').filter(Boolean)
      handleInputChange('planned_activities', activities)
    } catch (e) {
      // If parsing fails, split by newlines
      handleInputChange('planned_activities', value.split('\n').filter(Boolean))
    }
  }

  const handleExpenseChange = (index: number, field: keyof Expense, value: any) => {
    setEditedData(prev => ({
      ...prev,
      expenses: prev.expenses.map((exp, i) => 
        i === index 
          ? { ...exp, [field]: field === 'total_cost' ? Number(value) || 0 : value }
          : exp
      )
    }))
  }

  // Function to prepare data before confirming
  const handleConfirm = () => {
    setIsSubmitting(true)
    // Convert empty strings back to null for the database
    const preparedData: ExtractedData = {
      date: editedData.date || null,
      state: editedData.state || null,
      locality: editedData.locality || null,
      project_objectives: editedData.project_objectives || null,
      intended_beneficiaries: editedData.intended_beneficiaries || null,
      estimated_beneficiaries: editedData.estimated_beneficiaries || null,
      estimated_timeframe: editedData.estimated_timeframe || null,
      additional_support: editedData.additional_support || null,
      banking_details: editedData.banking_details || null,
      program_officer_name: editedData.program_officer_name || null,
      program_officer_phone: editedData.program_officer_phone || null,
      reporting_officer_name: editedData.reporting_officer_name || null,
      reporting_officer_phone: editedData.reporting_officer_phone || null,
      finance_officer_name: editedData.finance_officer_name || null,
      finance_officer_phone: editedData.finance_officer_phone || null,
      planned_activities: editedData.planned_activities,
      expenses: editedData.expenses,
      language: editedData.language || null
    }

    onConfirm(preparedData)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t('err:review_extracted_data')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Basic Information - 3 columns */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Date</Label>
              <Input
                value={editedData.date || ''}
                onChange={(e) => handleInputChange('date', e.target.value)}
              />
            </div>

            <div>
              <Label>State</Label>
              <div className="p-2 bg-muted rounded-md">
                {editedData.state || ''}
              </div>
            </div>

            <div>
              <Label>Locality</Label>
              <div className="p-2 bg-muted rounded-md">
                {editedData.locality || ''}
              </div>
            </div>

            <div>
              <Label>Estimated Timeframe</Label>
              <Input
                value={editedData.estimated_timeframe || ''}
                onChange={(e) => handleInputChange('estimated_timeframe', e.target.value)}
              />
            </div>

            <div>
              <Label>Estimated Beneficiaries</Label>
              <Input
                type="number"
                value={editedData.estimated_beneficiaries || ''}
                onChange={(e) => handleInputChange('estimated_beneficiaries', parseInt(e.target.value))}
              />
            </div>
          </div>

          {/* Full width fields */}
          <div className="space-y-4">
            <div>
              <Label htmlFor="project_objectives">Project Objectives</Label>
              <Textarea
                id="project_objectives"
                value={editedData.project_objectives || ''}
                onChange={(e) => handleInputChange('project_objectives', e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <div>
              <Label htmlFor="intended_beneficiaries">Intended Beneficiaries</Label>
              <Textarea
                id="intended_beneficiaries"
                value={editedData.intended_beneficiaries || ''}
                onChange={(e) => handleInputChange('intended_beneficiaries', e.target.value)}
              />
            </div>
          </div>

          {/* Planned Activities Section */}
          <div>
            <Label className="text-lg font-semibold mb-2">Planned Activities</Label>
            <div className="space-y-1 border rounded-lg p-2">
              {[
                'مساندة المستشفيات',
                'تشغيل المركز الصحي بالحي',
                'الخدمات (كهرباء، مياه، مواصلات عامة)',
                'المطبخ المشترك/ تموين',
                'الاحتياجات و الفعاليات النسوية',
                'مراكز الإيواء',
                'الحماية و الإجلاء',
                'مراكز الأطفال و التعليم البديل'
              ].map((activity, index) => (
                <div 
                  key={index} 
                  className={cn(
                    "flex items-center px-3 py-2 rounded hover:bg-muted/50 transition-colors",
                    editedData.planned_activities.includes(activity) && "bg-muted"
                  )}
                >
                  <button
                    type="button"
                    className="flex items-center gap-3 w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded"
                    onClick={() => {
                      const newActivities = editedData.planned_activities.includes(activity)
                        ? editedData.planned_activities.filter(a => a !== activity)
                        : [...editedData.planned_activities, activity];
                      handleInputChange('planned_activities', newActivities);
                    }}
                  >
                    <div 
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                        editedData.planned_activities.includes(activity)
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-muted"
                      )}
                    >
                      {editedData.planned_activities.includes(activity) && (
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 16 16"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M13.3334 4L6.00008 11.3333L2.66675 8"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                    <span className="text-sm">{activity}</span>
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Expenses Section */}
          <div>
            <Label className="text-lg font-semibold mb-2">Expenses</Label>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse border">
                <thead>
                  <tr className="bg-muted">
                    <th className="border p-2 text-right">Activity</th>
                    <th className="border p-2 text-right">Total Cost</th>
                    <th className="border p-2 w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {editedData.expenses.map((expense, index) => (
                    <tr key={index}>
                      <td className="border p-2">
                        <Input
                          value={expense.activity}
                          onChange={(e) => handleExpenseChange(index, 'activity', e.target.value)}
                          className="w-full"
                        />
                      </td>
                      <td className="border p-2">
                        <Input
                          type="number"
                          value={expense.total_cost || ''}
                          onChange={(e) => handleExpenseChange(index, 'total_cost', e.target.value ? parseFloat(e.target.value) : null)}
                          className="w-full"
                        />
                      </td>
                      <td className="border p-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            setEditedData(prev => ({
                              ...prev,
                              expenses: prev.expenses.filter((_, i) => i !== index)
                            }));
                          }}
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 6h18" />
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                          </svg>
                          <span className="sr-only">Delete expense</span>
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted">
                    <td className="border p-2 text-right font-bold">
                      Total Cost
                    </td>
                    <td colSpan={2} className="border p-2 font-bold">
                      ${editedData.expenses.reduce((sum, expense) => sum + (expense.total_cost || 0), 0).toFixed(2)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              onClick={() => {
                setEditedData(prev => ({
                  ...prev,
                  expenses: [...prev.expenses, { activity: '', total_cost: 0 }]
                }))
              }}
              className="mt-2"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Expense
            </Button>
          </div>

          {/* Contact Information - 2 columns */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4">
              <div>
                <Label>Program Officer</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={editedData.program_officer_name || ''}
                    onChange={(e) => handleInputChange('program_officer_name', e.target.value)}
                    placeholder="Name"
                  />
                  <Input
                    value={editedData.program_officer_phone || ''}
                    onChange={(e) => handleInputChange('program_officer_phone', e.target.value)}
                    placeholder="Phone"
                  />
                </div>
              </div>

              <div>
                <Label>Reporting Officer</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={editedData.reporting_officer_name || ''}
                    onChange={(e) => handleInputChange('reporting_officer_name', e.target.value)}
                    placeholder="Name"
                  />
                  <Input
                    value={editedData.reporting_officer_phone || ''}
                    onChange={(e) => handleInputChange('reporting_officer_phone', e.target.value)}
                    placeholder="Phone"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label>Finance Officer</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    value={editedData.finance_officer_name || ''}
                    onChange={(e) => handleInputChange('finance_officer_name', e.target.value)}
                    placeholder="Name"
                  />
                  <Input
                    value={editedData.finance_officer_phone || ''}
                    onChange={(e) => handleInputChange('finance_officer_phone', e.target.value)}
                    placeholder="Phone"
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="additional_support">Additional Support</Label>
            <Textarea
              id="additional_support"
              value={editedData.additional_support || ''}
              onChange={(e) => handleInputChange('additional_support', e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="banking_details">Banking Details</Label>
            <Textarea
              id="banking_details"
              value={editedData.banking_details || ''}
              onChange={(e) => handleInputChange('banking_details', e.target.value)}
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-4 mt-8">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button 
          onClick={handleConfirm} 
          className="bg-green-600 hover:bg-green-700"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Uploading...' : 'Confirm and Upload'}
        </Button>
      </div>
    </div>
  )
} 