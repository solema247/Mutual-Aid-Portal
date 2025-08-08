import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { useTranslation } from 'react-i18next'

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
  expenses: any[] | null;
}

interface ExtractedDataReviewProps {
  data: ExtractedData;
  onConfirm: (editedData: ExtractedData) => void;
  onCancel: () => void;
}

export default function ExtractedDataReview({ data, onConfirm, onCancel }: ExtractedDataReviewProps) {
  const { t } = useTranslation(['common', 'err'])
  
  // Initialize state with null values converted to empty strings for form inputs
  const [editedData, setEditedData] = useState<ExtractedData>({
    ...data,
    date: data.date || '',
    state: data.state || '',
    locality: data.locality || '',
    project_objectives: data.project_objectives || '',
    intended_beneficiaries: data.intended_beneficiaries || '',
    estimated_beneficiaries: data.estimated_beneficiaries || 0,
    estimated_timeframe: data.estimated_timeframe || '',
    additional_support: data.additional_support || '',
    banking_details: data.banking_details || '',
    program_officer_name: data.program_officer_name || '',
    program_officer_phone: data.program_officer_phone || '',
    reporting_officer_name: data.reporting_officer_name || '',
    reporting_officer_phone: data.reporting_officer_phone || '',
    finance_officer_name: data.finance_officer_name || '',
    finance_officer_phone: data.finance_officer_phone || '',
    planned_activities: data.planned_activities || [],
    expenses: data.expenses || []
  })

  const handleInputChange = (field: keyof ExtractedData, value: any) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value || ''
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

  // Function to prepare data before confirming
  const handleConfirm = () => {
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
      expenses: editedData.expenses
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                value={editedData.date || ''}
                onChange={(e) => handleInputChange('date', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={editedData.state || ''}
                onChange={(e) => handleInputChange('state', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="locality">Locality</Label>
              <Input
                id="locality"
                value={editedData.locality || ''}
                onChange={(e) => handleInputChange('locality', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="estimated_beneficiaries">Estimated Beneficiaries</Label>
              <Input
                id="estimated_beneficiaries"
                type="number"
                value={editedData.estimated_beneficiaries || ''}
                onChange={(e) => handleInputChange('estimated_beneficiaries', parseInt(e.target.value))}
              />
            </div>

            <div>
              <Label htmlFor="estimated_timeframe">Estimated Timeframe</Label>
              <Input
                id="estimated_timeframe"
                value={editedData.estimated_timeframe || ''}
                onChange={(e) => handleInputChange('estimated_timeframe', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="project_objectives">Project Objectives</Label>
            <Textarea
              id="project_objectives"
              value={editedData.project_objectives || ''}
              onChange={(e) => handleInputChange('project_objectives', e.target.value)}
              rows={4}
            />
          </div>

          <div>
            <Label htmlFor="intended_beneficiaries">Intended Beneficiaries</Label>
            <Textarea
              id="intended_beneficiaries"
              value={editedData.intended_beneficiaries || ''}
              onChange={(e) => handleInputChange('intended_beneficiaries', e.target.value)}
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="planned_activities">Planned Activities (one per line)</Label>
            <Textarea
              id="planned_activities"
              value={Array.isArray(editedData.planned_activities) ? 
                editedData.planned_activities.join('\n') : 
                editedData.planned_activities || ''}
              onChange={(e) => handlePlannedActivitiesChange(e.target.value)}
              rows={6}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="program_officer_name">Program Officer Name</Label>
              <Input
                id="program_officer_name"
                value={editedData.program_officer_name || ''}
                onChange={(e) => handleInputChange('program_officer_name', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="program_officer_phone">Program Officer Phone</Label>
              <Input
                id="program_officer_phone"
                value={editedData.program_officer_phone || ''}
                onChange={(e) => handleInputChange('program_officer_phone', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="reporting_officer_name">Reporting Officer Name</Label>
              <Input
                id="reporting_officer_name"
                value={editedData.reporting_officer_name || ''}
                onChange={(e) => handleInputChange('reporting_officer_name', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="reporting_officer_phone">Reporting Officer Phone</Label>
              <Input
                id="reporting_officer_phone"
                value={editedData.reporting_officer_phone || ''}
                onChange={(e) => handleInputChange('reporting_officer_phone', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="finance_officer_name">Finance Officer Name</Label>
              <Input
                id="finance_officer_name"
                value={editedData.finance_officer_name || ''}
                onChange={(e) => handleInputChange('finance_officer_name', e.target.value)}
              />
            </div>

            <div>
              <Label htmlFor="finance_officer_phone">Finance Officer Phone</Label>
              <Input
                id="finance_officer_phone"
                value={editedData.finance_officer_phone || ''}
                onChange={(e) => handleInputChange('finance_officer_phone', e.target.value)}
              />
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

      <div className="flex justify-end space-x-4">
        <Button variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button onClick={handleConfirm}>
          Confirm and Upload
        </Button>
      </div>
    </div>
  )
} 