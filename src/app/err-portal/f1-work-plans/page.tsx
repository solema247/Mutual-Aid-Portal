'use client'

import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ChevronDown, ChevronUp, BarChart } from 'lucide-react'
import ERRAppSubmissions from './components/ERRAppSubmissions'
import DirectUpload from './components/DirectUpload'
import ManualEntry from './components/ManualEntry'
import PoolDashboard from './components/PoolDashboard'

export default function F1WorkPlansPage() {
  const { t } = useTranslation(['f1_plans', 'common'])
  const [currentTab, setCurrentTab] = useState<'err_app' | 'direct_upload' | 'manual_entry'>('direct_upload')
  const [isByStateCollapsed, setIsByStateCollapsed] = useState(true)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t('f1_plans:title')}</h2>
      </div>

      {/* Pool Dashboard - Summary Cards */}
      <Card className="border-0">
        <CardHeader>
          <CardTitle>{t('f1_plans:pool_overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PoolDashboard showByDonor={false} showSummaryCards={true} showByState={false} />
        </CardContent>
      </Card>

      {/* Manage and review F1 work plans */}
      <Card className="border-0">
        <CardHeader>
          <CardTitle>{t('f1_plans:description')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs 
            defaultValue="direct_upload" 
            className="w-full" 
            onValueChange={(value) => setCurrentTab(value as 'err_app' | 'direct_upload' | 'manual_entry')}
          >
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="err_app">
                {t('f1_plans:err_app_submissions')}
              </TabsTrigger>
              <TabsTrigger value="direct_upload">
                {t('f1_plans:direct_upload.title')}
              </TabsTrigger>
              <TabsTrigger value="manual_entry">
                {t('f1_plans:manual_entry', { defaultValue: 'Manual Entry' })}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="err_app" className="mt-6">
              <ERRAppSubmissions />
            </TabsContent>

            <TabsContent value="direct_upload" className="mt-6">
              <DirectUpload />
            </TabsContent>

            <TabsContent value="manual_entry" className="mt-6">
              <ManualEntry onSuccess={() => setCurrentTab('direct_upload')} />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Pool Dashboard - By State Table */}
      <Card className="border-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle 
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setIsByStateCollapsed(!isByStateCollapsed)}
            >
              <BarChart className="h-5 w-5" />
              {t('f1_plans:pool_overview')}
              {isByStateCollapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </CardTitle>
          </div>
        </CardHeader>
        {!isByStateCollapsed && (
          <CardContent>
            <PoolDashboard showByDonor={false} showSummaryCards={false} showByState={true} />
          </CardContent>
        )}
      </Card>
    </div>
  )
}
