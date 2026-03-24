'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { Eye, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScreeningDetailView } from './ScreeningDetailView'
import { type MockBeneficiary, type ScreeningStatus } from '../mockData'

interface ComplianceQueueProps {
  beneficiaries: MockBeneficiary[]
}

function ScreeningStatusBadge({ status }: { status: ScreeningStatus }) {
  const config = {
    Cleared: {
      icon: CheckCircle,
      className: 'bg-green-100 text-green-800 border-green-200',
      label: 'Cleared'
    },
    Pending: {
      icon: Clock,
      className: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      label: 'Pending'
    },
    Flagged: {
      icon: AlertCircle,
      className: 'bg-orange-100 text-orange-800 border-orange-200',
      label: 'Flagged'
    },
    Rejected: {
      icon: XCircle,
      className: 'bg-red-100 text-red-800 border-red-200',
      label: 'Rejected'
    },
    'Not Required': {
      icon: Clock,
      className: 'bg-gray-100 text-gray-800 border-gray-200',
      label: 'Not Required'
    }
  }

  const { icon: Icon, className, label } = config[status]

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${className}`}>
      <Icon className="h-3 w-3" />
      {label}
    </span>
  )
}

export function ComplianceQueue({ beneficiaries }: ComplianceQueueProps) {
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<MockBeneficiary | null>(null)
  const [isDialogOpen, setIsDialogOpen] = useState(false)

  const handleViewDetails = (beneficiary: MockBeneficiary) => {
    setSelectedBeneficiary(beneficiary)
    setIsDialogOpen(true)
  }

  if (beneficiaries.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No beneficiaries match your search criteria.</p>
      </div>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Position</TableHead>
              <TableHead>F1 Project</TableHead>
              <TableHead>ERR Code</TableHead>
              <TableHead>State</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Queued</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {beneficiaries.map((beneficiary) => (
              <TableRow key={beneficiary.id}>
                <TableCell className="font-medium">{beneficiary.full_name}</TableCell>
                <TableCell>{beneficiary.position}</TableCell>
                <TableCell className="max-w-[200px] truncate">
                  {beneficiary.f1_project_name}
                </TableCell>
                <TableCell>{beneficiary.err_code}</TableCell>
                <TableCell>{beneficiary.state}</TableCell>
                <TableCell>
                  <ScreeningStatusBadge status={beneficiary.screening_status} />
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(beneficiary.queued_at), 'MMM d, yyyy')}
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleViewDetails(beneficiary)}
                  >
                    <Eye className="h-4 w-4 mr-1" />
                    View
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Beneficiary Screening Details</DialogTitle>
            <DialogDescription>
              Review beneficiary information and screening results
            </DialogDescription>
          </DialogHeader>
          {selectedBeneficiary && (
            <ScreeningDetailView
              beneficiary={selectedBeneficiary}
              onClose={() => setIsDialogOpen(false)}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
