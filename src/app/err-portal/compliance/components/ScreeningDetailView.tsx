'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { CheckCircle, XCircle, AlertCircle, FileText, User, Phone, Calendar, Hash, MapPin } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { type MockBeneficiary } from '../mockData'

interface ScreeningDetailViewProps {
  beneficiary: MockBeneficiary
  onClose: () => void
}

export function ScreeningDetailView({ beneficiary, onClose }: ScreeningDetailViewProps) {
  const [notes, setNotes] = useState('')
  const [isScreening, setIsScreening] = useState(false)

  const handleRunScreening = () => {
    setIsScreening(true)
    // Simulate screening process
    setTimeout(() => {
      setIsScreening(false)
      alert('Screening complete! (Demo mode - no actual API call made)')
    }, 2000)
  }

  const handleSaveResult = (status: 'Cleared' | 'Flagged' | 'Rejected') => {
    alert(`Demo: Would save screening result as "${status}" with notes: ${notes}`)
    onClose()
  }

  return (
    <div className="space-y-6">
      {/* Beneficiary Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Beneficiary Information
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Full Name</p>
              <p className="font-medium">{beneficiary.full_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Position</p>
              <p className="font-medium">{beneficiary.position}</p>
            </div>
            {beneficiary.id_number && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Hash className="h-3 w-3" />
                  ID Number
                </p>
                <p className="font-medium font-mono">{beneficiary.id_number}</p>
              </div>
            )}
            {beneficiary.date_of_birth && (
              <div>
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  Date of Birth
                </p>
                <p className="font-medium">{format(new Date(beneficiary.date_of_birth), 'MMMM d, yyyy')}</p>
              </div>
            )}
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" />
                Phone
              </p>
              <p className="font-medium">{beneficiary.phone}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                Location
              </p>
              <p className="font-medium">{beneficiary.state}, {beneficiary.locality}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* F1 Project Information */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Associated F1 Project
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Project Name</p>
              <p className="font-medium">{beneficiary.f1_project_name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">ERR Code</p>
              <p className="font-medium">{beneficiary.err_code}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Screening Results */}
      {beneficiary.screening_status !== 'Pending' && (
        <Card>
          <CardHeader>
            <CardTitle>Screening Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground">Status</p>
              <div className="mt-1">
                {beneficiary.screening_status === 'Cleared' && (
                  <span className="inline-flex items-center gap-2 text-green-700">
                    <CheckCircle className="h-5 w-5" />
                    <span className="font-medium">Cleared - No sanctions match found</span>
                  </span>
                )}
                {beneficiary.screening_status === 'Flagged' && (
                  <span className="inline-flex items-center gap-2 text-orange-700">
                    <AlertCircle className="h-5 w-5" />
                    <span className="font-medium">Flagged - Potential match requires review</span>
                  </span>
                )}
                {beneficiary.screening_status === 'Rejected' && (
                  <span className="inline-flex items-center gap-2 text-red-700">
                    <XCircle className="h-5 w-5" />
                    <span className="font-medium">Rejected - Sanctions match confirmed</span>
                  </span>
                )}
              </div>
            </div>

            {beneficiary.risk_score !== undefined && (
              <div>
                <p className="text-sm text-muted-foreground">Risk Score</p>
                <p className="font-medium">{beneficiary.risk_score}/100</p>
              </div>
            )}

            {beneficiary.match_details && (
              <div>
                <p className="text-sm text-muted-foreground">Match Details</p>
                <p className="text-sm bg-gray-50 p-3 rounded-md border">{beneficiary.match_details}</p>
              </div>
            )}

            {beneficiary.screened_by && (
              <div className="grid grid-cols-2 gap-4 pt-2 border-t">
                <div>
                  <p className="text-sm text-muted-foreground">Screened By</p>
                  <p className="font-medium">{beneficiary.screened_by}</p>
                </div>
                {beneficiary.screened_at && (
                  <div>
                    <p className="text-sm text-muted-foreground">Screened At</p>
                    <p className="font-medium">{format(new Date(beneficiary.screened_at), 'MMM d, yyyy HH:mm')}</p>
                  </div>
                )}
              </div>
            )}

            {beneficiary.notes && (
              <div>
                <p className="text-sm text-muted-foreground">Compliance Officer Notes</p>
                <p className="text-sm bg-gray-50 p-3 rounded-md border whitespace-pre-wrap">{beneficiary.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Screening Actions (only for pending cases in demo) */}
      {beneficiary.screening_status === 'Pending' && (
        <Card>
          <CardHeader>
            <CardTitle>Screening Actions</CardTitle>
            <CardDescription>Run screening check and record results</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Button
                onClick={handleRunScreening}
                disabled={isScreening}
                className="w-full"
              >
                {isScreening ? 'Running Screening...' : 'Run OFAC Screening Check'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                Demo mode: This will simulate calling an external screening API
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Compliance Notes</label>
              <Textarea
                placeholder="Enter notes about this screening (justification, match analysis, etc.)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
              />
            </div>

            <div className="flex gap-2 pt-4 border-t">
              <Button
                variant="default"
                onClick={() => handleSaveResult('Cleared')}
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Clear
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSaveResult('Flagged')}
                className="flex-1 text-orange-600 border-orange-600 hover:bg-orange-50"
              >
                <AlertCircle className="h-4 w-4 mr-2" />
                Flag
              </Button>
              <Button
                variant="destructive"
                onClick={() => handleSaveResult('Rejected')}
                className="flex-1"
              >
                <XCircle className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
