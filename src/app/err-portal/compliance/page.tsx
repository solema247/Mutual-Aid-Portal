'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import Link from 'next/link'
import { ArrowLeft, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { ComplianceQueue } from './components/ComplianceQueue'
import { MOCK_BENEFICIARIES, type ScreeningStatus } from './mockData'

export default function CompliancePage() {
  const { t } = useTranslation(['common', 'err'])
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState<ScreeningStatus | 'All'>('All')

  // Filter beneficiaries based on search and status
  const filteredBeneficiaries = MOCK_BENEFICIARIES.filter(beneficiary => {
    const matchesSearch = searchTerm === '' ||
      beneficiary.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      beneficiary.f1_project_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      beneficiary.err_code.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'All' || beneficiary.screening_status === statusFilter

    return matchesSearch && matchesStatus
  })

  // Calculate statistics
  const stats = {
    total: MOCK_BENEFICIARIES.length,
    pending: MOCK_BENEFICIARIES.filter(b => b.screening_status === 'Pending').length,
    cleared: MOCK_BENEFICIARIES.filter(b => b.screening_status === 'Cleared').length,
    flagged: MOCK_BENEFICIARIES.filter(b => b.screening_status === 'Flagged').length,
    rejected: MOCK_BENEFICIARIES.filter(b => b.screening_status === 'Rejected').length,
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <Button variant="ghost" size="sm" asChild className="w-fit -ml-2">
            <Link href="/err-portal" className="flex items-center gap-2 text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              {t('common:back_to_home')}
            </Link>
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Compliance Screening Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              OFAC and sanctions list screening for fund recipients
            </p>
          </div>
        </div>

        {/* Demo Notice */}
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-amber-600 mt-0.5" />
              <div>
                <h3 className="font-semibold text-amber-900">Prototype Demo Mode</h3>
                <p className="text-sm text-amber-800 mt-1">
                  This is a prototype demonstration using mock data. All beneficiaries and screening results shown are fictional examples for stakeholder review.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-yellow-600">Pending</CardDescription>
              <CardTitle className="text-2xl text-yellow-600">{stats.pending}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-green-600">Cleared</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.cleared}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-orange-600">Flagged</CardDescription>
              <CardTitle className="text-2xl text-orange-600">{stats.flagged}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="text-red-600">Rejected</CardDescription>
              <CardTitle className="text-2xl text-red-600">{stats.rejected}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardHeader>
            <CardTitle>Screening Queue</CardTitle>
            <CardDescription>
              Search and filter beneficiaries for compliance screening
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <Input
                placeholder="Search by name, project, or ERR code..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="flex-1"
              />
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as ScreeningStatus | 'All')}
              >
                <SelectTrigger className="w-full sm:w-[200px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="All">All Statuses</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="Cleared">Cleared</SelectItem>
                  <SelectItem value="Flagged">Flagged</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Queue Table */}
            <ComplianceQueue beneficiaries={filteredBeneficiaries} />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
