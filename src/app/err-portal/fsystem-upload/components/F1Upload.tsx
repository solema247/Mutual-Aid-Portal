'use client'

import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { FileUp } from 'lucide-react'
import { supabase } from '@/lib/supabaseClient'
import type { Donor, State, F1FormData } from '@/app/api/fsystem/types/fsystem'

export default function F1Upload() {
  const { t } = useTranslation(['common', 'err'])
  const [donors, setDonors] = useState<Donor[]>([])
  const [states, setStates] = useState<State[]>([])
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [formData, setFormData] = useState<F1FormData>({
    donor_id: '',
    state_id: '',
    date: '',
    grant_serial: '',
    project_id: '',
    file: null
  })
  const [isLoading, setIsLoading] = useState(false)
  const [previewId, setPreviewId] = useState('')

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch donors
        const { data: donorsData, error: donorsError } = await supabase
          .from('donors')
          .select('*')
          .eq('status', 'active')
        
        if (donorsError) throw donorsError
        setDonors(donorsData)

        // Fetch states
        const { data: statesData, error: statesError } = await supabase
          .from('states')
          .select('*')
        
        if (statesError) throw statesError
        setStates(statesData)
      } catch (error) {
        console.error('Error fetching data:', error)
      }
    }

    fetchData()
  }, [])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      if (file.type === 'application/pdf' || file.type === 'application/msword' || 
          file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        setSelectedFile(file)
        setFormData(prev => ({ ...prev, file }))
      } else {
        alert('Please upload a PDF or Word document')
      }
    }
  }

  const generateFormId = () => {
    const selectedDonor = donors.find(d => d.id === formData.donor_id)
    const selectedState = states.find(s => s.id === formData.state_id)
    
    if (!selectedDonor?.short_name || !selectedState?.state_name) return ''

    // Get state code (first 2 letters)
    const stateCode = selectedState.state_name.substring(0, 2).toUpperCase()
    
    // Format date (MMYY)
    const dateStr = formData.date

    return `LCC-${selectedDonor.short_name}-${stateCode}-${dateStr}-${formData.grant_serial}-${formData.project_id}`
  }

  const handleInputChange = (field: keyof F1FormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    // Update preview ID whenever form data changes
    const newId = generateFormId()
    setPreviewId(newId)
  }, [formData])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFile) {
      alert('Please select a file')
      return
    }

    setIsLoading(true)
    try {
      const selectedDonor = donors.find(d => d.id === formData.donor_id)
      const selectedState = states.find(s => s.id === formData.state_id)
      
      if (!selectedDonor?.short_name || !selectedState?.state_name) {
        throw new Error('Missing donor or state information')
      }

      // Get state code (first 2 letters)
      const stateCode = selectedState.state_name.substring(0, 2).toUpperCase()
      
      // Get file extension
      const fileExtension = selectedFile.name.split('.').pop()
      
      // Upload file to Supabase storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('images')
        .upload(`f1-forms/${selectedDonor.short_name}/${stateCode}/${formData.date}/${previewId}.${fileExtension}`, selectedFile, {
          cacheControl: '3600',
          upsert: false
        })

      if (uploadError) {
        throw uploadError
      }

      alert('Form uploaded successfully!')
      setFormData({
        donor_id: '',
        state_id: '',
        date: '',
        grant_serial: '',
        project_id: '',
        file: null
      })
      setSelectedFile(null)
      setPreviewId('')

    } catch (error) {
      console.error('Error submitting form:', error)
      alert('Error uploading form. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div>
                <Label htmlFor="file">Upload F1 Form (PDF or Word)</Label>
                <Input
                  id="file"
                  type="file"
                  accept=".pdf,.doc,.docx"
                  onChange={handleFileChange}
                  className="mt-1"
                />
              </div>

              <div>
                <Label htmlFor="donor">Donor</Label>
                <Select
                  value={formData.donor_id}
                  onValueChange={(value) => handleInputChange('donor_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select donor" />
                  </SelectTrigger>
                  <SelectContent>
                    {donors.map((donor) => (
                      <SelectItem key={donor.id} value={donor.id}>
                        {donor.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="state">State</Label>
                <Select
                  value={formData.state_id}
                  onValueChange={(value) => handleInputChange('state_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select state" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((state) => (
                      <SelectItem key={state.id} value={state.id}>
                        {state.state_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="date">Date (MMYY)</Label>
                <Input
                  id="date"
                  placeholder="1224"
                  value={formData.date}
                  onChange={(e) => handleInputChange('date', e.target.value)}
                  maxLength={4}
                  pattern="[0-9]{4}"
                />
              </div>

              <div>
                <Label htmlFor="grant">Grant Serial</Label>
                <Input
                  id="grant"
                  placeholder="0001"
                  value={formData.grant_serial}
                  onChange={(e) => handleInputChange('grant_serial', e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="project">Project ID</Label>
                <Input
                  id="project"
                  placeholder="301"
                  value={formData.project_id}
                  onChange={(e) => handleInputChange('project_id', e.target.value)}
                />
              </div>

              {previewId && (
                <div className="pt-4">
                  <Label>Generated Form ID</Label>
                  <div className="mt-1 p-3 bg-muted rounded-md font-mono">
                    {previewId}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        <FileUp className="w-4 h-4 mr-2" />
        {isLoading ? 'Uploading...' : 'Upload F1 Form'}
      </Button>
    </form>
  )
} 