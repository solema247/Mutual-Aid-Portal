'use client'

import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { ScreeningStatusBadge } from './ScreeningStatusBadge'
import { MOCK_BENEFICIARIES, MOCK_F1_PROJECTS, type ScreeningStatus } from '@/app/err-portal/compliance/mockData'

interface ProjectScreeningStatusProps {
  projectId: string
}

export function ProjectScreeningStatus({ projectId }: ProjectScreeningStatusProps) {
  // Get project screening summary
  const project = MOCK_F1_PROJECTS.find(p => p.id === projectId)

  // Get beneficiaries for this project
  const beneficiaries = MOCK_BENEFICIARIES.filter(b => b.f1_project_id === projectId)

  if (!project || beneficiaries.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No beneficiary screening data available for this project.</p>
        <p className="text-sm mt-2">This may be because ID documents were not included in the F1 submission.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Overall Status Summary */}
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Overall Screening Status</h3>
              <div className="flex items-center gap-2">
                <ScreeningStatusBadge
                  status={project.screening_status}
                  pendingCount={project.pending_count}
                  flaggedCount={project.flagged_count}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
              <div>
                <p className="text-sm text-muted-foreground">Total Beneficiaries</p>
                <p className="text-2xl font-bold">{project.total_beneficiaries}</p>
              </div>
              <div>
                <p className="text-sm text-green-600">Cleared</p>
                <p className="text-2xl font-bold text-green-600">{project.cleared_count}</p>
              </div>
              <div>
                <p className="text-sm text-yellow-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">{project.pending_count}</p>
              </div>
              <div>
                <p className="text-sm text-orange-600">Flagged</p>
                <p className="text-2xl font-bold text-orange-600">{project.flagged_count}</p>
              </div>
            </div>

            {project.rejected_count > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-sm font-medium text-red-900">
                  ⚠️ Warning: {project.rejected_count} beneficiary(ies) rejected due to sanctions match.
                  Payment for this F1 cannot proceed until resolved.
                </p>
              </div>
            )}

            {project.pending_count > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
                <p className="text-sm text-yellow-900">
                  ⏳ {project.pending_count} beneficiary(ies) awaiting screening.
                  You can approve this F1, but final payment requires cleared screening.
                </p>
              </div>
            )}

            {project.flagged_count > 0 && (
              <div className="bg-orange-50 border border-orange-200 rounded-md p-4">
                <p className="text-sm text-orange-900">
                  ⚠️ {project.flagged_count} beneficiary(ies) flagged for review.
                  Please review the compliance dashboard before approving.
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Beneficiaries List */}
      <div>
        <h3 className="text-lg font-semibold mb-4">Beneficiaries</h3>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Position</TableHead>
                <TableHead>ID Number</TableHead>
                <TableHead>Screening Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {beneficiaries.map((beneficiary) => (
                <TableRow key={beneficiary.id}>
                  <TableCell className="font-medium">{beneficiary.full_name}</TableCell>
                  <TableCell>{beneficiary.position}</TableCell>
                  <TableCell className="font-mono text-sm">
                    {beneficiary.id_number || <span className="text-muted-foreground">—</span>}
                  </TableCell>
                  <TableCell>
                    <ScreeningStatusBadge status={beneficiary.screening_status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Link to Full Compliance Dashboard */}
      <div className="flex justify-end">
        <Button variant="outline" asChild>
          <Link href="/err-portal/compliance" className="flex items-center gap-2">
            View Full Screening Details
            <ExternalLink className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </div>
  )
}
