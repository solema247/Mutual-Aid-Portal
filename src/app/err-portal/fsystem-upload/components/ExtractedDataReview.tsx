import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'
import { Plus, Minus, Check } from 'lucide-react'
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
}: ExtractedDataReviewProps) {
  const { t } = useTranslation(['common', 'fsystem'])
  const [isSubmitting, setIsSubmitting] = useState(false)
  
  // Keep track of all activities and selected activities separately
  const [editedData, setEditedData] = useState<ExtractedData>({
    ...data,
    planned_activities: Array.isArray(data.planned_activities) ? data.planned_activities : [],
    expenses: Array.isArray(data.expenses) ? data.expenses.map(exp => ({
      activity: exp.activity || '',
      total_cost: typeof exp.total_cost === 'number' ? exp.total_cost : 0
    })) : []
  })

  const [selectedActivities, setSelectedActivities] = useState<string[]>(
    Array.isArray(data.planned_activities) ? data.planned_activities : []
  )

  const [newActivity, setNewActivity] = useState('')

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

  const handleAddActivity = () => {
    if (newActivity.trim()) {
      setEditedData(prev => ({
        ...prev,
        planned_activities: [...prev.planned_activities, newActivity.trim()]
      }))
      setSelectedActivities(prev => [...prev, newActivity.trim()])
      setNewActivity('')
    }
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

  const toggleActivity = (activity: string) => {
    setSelectedActivities(prev => 
      prev.includes(activity)
        ? prev.filter(a => a !== activity)
        : [...prev, activity]
    )
  }

  // Add function to calculate total expenses
  const calculateTotalExpenses = () => {
    return editedData.expenses.reduce((sum, expense) => sum + (expense.total_cost || 0), 0)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('fsystem:review.title')}</CardTitle>
        <CardDescription>{t('fsystem:review.description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Basic Information - 3 columns */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>{t('fsystem:review.fields.date')}</Label>
            <Input
              value={editedData.date || ''}
              onChange={(e) => handleInputChange('date', e.target.value)}
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.state')}</Label>
            <div className="p-2 bg-muted rounded-md">
              {editedData.state || ''}
            </div>
          </div>

          <div>
            <Label>{t('fsystem:review.fields.locality')}</Label>
            <div className="p-2 bg-muted rounded-md">
              {editedData.locality || ''}
            </div>
          </div>

          <div>
            <Label>{t('fsystem:review.fields.estimated_timeframe')}</Label>
            <Input
              value={editedData.estimated_timeframe || ''}
              onChange={(e) => handleInputChange('estimated_timeframe', e.target.value)}
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.estimated_beneficiaries')}</Label>
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
            <Label>{t('fsystem:review.fields.project_objectives')}</Label>
            <Textarea
              value={editedData.project_objectives || ''}
              onChange={(e) => handleInputChange('project_objectives', e.target.value)}
              className="min-h-[100px]"
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.intended_beneficiaries')}</Label>
            <Textarea
              value={editedData.intended_beneficiaries || ''}
              onChange={(e) => handleInputChange('intended_beneficiaries', e.target.value)}
            />
          </div>
        </div>

        {/* Planned Activities Section */}
        <div>
          <Label className="text-lg font-semibold mb-2">{t('fsystem:review.fields.planned_activities')}</Label>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('fsystem:review.fields.activity')}</th>
                  <th className="w-16 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {editedData.planned_activities.map((activity, index) => (
                  <tr 
                    key={index}
                    className={cn(
                      "border-t cursor-pointer hover:bg-muted/50 transition-colors",
                      selectedActivities.includes(activity) && "bg-primary/5"
                    )}
                    onClick={() => toggleActivity(activity)}
                  >
                    <td className="px-4 py-3">{activity}</td>
                    <td className="px-4 py-3 text-center">
                      <div className={cn(
                        "w-5 h-5 rounded-full border inline-flex items-center justify-center",
                        selectedActivities.includes(activity)
                          ? "bg-emerald-100 border-emerald-200 text-emerald-700"
                          : "border-muted-foreground"
                      )}>
                        {selectedActivities.includes(activity) && (
                          <Check className="w-3 h-3" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="p-4 border-t">
              <div className="flex gap-2">
                <Input
                  value={newActivity}
                  onChange={(e) => setNewActivity(e.target.value)}
                  placeholder={t('fsystem:review.fields.add_activity_placeholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddActivity()
                    }
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddActivity}
                  disabled={!newActivity.trim()}
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {t('fsystem:review.fields.add_activity')}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Expenses Section */}
        <div>
          <Label className="text-lg font-semibold mb-2">{t('fsystem:review.fields.expenses')}</Label>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-muted">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">{t('fsystem:review.fields.activity')}</th>
                  <th className="px-4 py-2 text-right font-medium">{t('fsystem:review.fields.total_cost')}</th>
                  <th className="w-16 px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {editedData.expenses.map((expense, index) => (
                  <tr key={index} className="border-t">
                    <td className="px-4 py-2">
                      <Input
                        value={expense.activity}
                        onChange={(e) => handleExpenseChange(index, 'activity', e.target.value)}
                        className="border-0 focus-visible:ring-0 px-0 py-0 h-8"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        value={expense.total_cost}
                        onChange={(e) => handleExpenseChange(index, 'total_cost', parseFloat(e.target.value))}
                        className="border-0 focus-visible:ring-0 px-0 py-0 h-8 text-right"
                      />
                    </td>
                    <td className="px-4 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation()
                          const newExpenses = editedData.expenses.filter((_, i) => i !== index)
                          handleInputChange('expenses', newExpenses)
                        }}
                        className="h-8 w-8 p-0"
                      >
                        ×
                      </Button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t bg-muted/50">
                  <td className="px-4 py-2 font-medium text-right">{t('fsystem:review.fields.total')}</td>
                  <td className="px-4 py-2 font-medium text-right">{calculateTotalExpenses().toLocaleString()}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
            <div className="p-4 border-t">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  handleInputChange('expenses', [
                    ...editedData.expenses,
                    { activity: '', total_cost: 0 }
                  ])
                }}
              >
                <Plus className="w-4 h-4 mr-2" />
                {t('fsystem:review.fields.add_expense')}
              </Button>
            </div>
          </div>
        </div>

        {/* Additional Support and Banking Details */}
        <div className="space-y-4">
          <div>
            <Label>{t('fsystem:review.fields.additional_support')}</Label>
            <Textarea
              value={editedData.additional_support || ''}
              onChange={(e) => handleInputChange('additional_support', e.target.value)}
            />
          </div>

          <div>
            <Label>{t('fsystem:review.fields.banking_details')}</Label>
            <Textarea
              value={editedData.banking_details || ''}
              onChange={(e) => handleInputChange('banking_details', e.target.value)}
            />
          </div>
        </div>

        {/* Contact Information - 2 columns */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-4">
            <div>
              <Label>{t('fsystem:review.fields.officers.program')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editedData.program_officer_name || ''}
                  onChange={(e) => handleInputChange('program_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={editedData.program_officer_phone || ''}
                  onChange={(e) => handleInputChange('program_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>

            <div>
              <Label>{t('fsystem:review.fields.officers.reporting')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editedData.reporting_officer_name || ''}
                  onChange={(e) => handleInputChange('reporting_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={editedData.reporting_officer_phone || ''}
                  onChange={(e) => handleInputChange('reporting_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <Label>{t('fsystem:review.fields.officers.finance')}</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={editedData.finance_officer_name || ''}
                  onChange={(e) => handleInputChange('finance_officer_name', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.name')}
                />
                <Input
                  value={editedData.finance_officer_phone || ''}
                  onChange={(e) => handleInputChange('finance_officer_phone', e.target.value)}
                  placeholder={t('fsystem:review.fields.officers.phone')}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4 mt-8">
          <Button variant="outline" onClick={onCancel}>
            {t('fsystem:review.cancel')}
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={isSubmitting}
            className="bg-green-600 hover:bg-green-700"
          >
            {isSubmitting ? t('fsystem:review.submitting') : t('fsystem:review.submit')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
} 