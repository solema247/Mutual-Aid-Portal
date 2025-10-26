'use client'

import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import ERRAppSubmissions from './components/ERRAppSubmissions'
import DirectUpload from './components/DirectUpload'
import PoolDashboard from './components/PoolDashboard'

export default function F1WorkPlansPage() {
  const { t } = useTranslation(['f1_plans', 'common'])
  const [currentTab, setCurrentTab] = useState<'err_app' | 'direct_upload'>('err_app')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t('f1_plans:title')}</h2>
      </div>

      {/* Pool Dashboard */}
      <Card>
        <CardHeader>
          <CardTitle>{t('f1_plans:pool_overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PoolDashboard showByDonor={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('f1_plans:description')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs 
            defaultValue="err_app" 
            className="w-full" 
            onValueChange={(value) => setCurrentTab(value as 'err_app' | 'direct_upload')}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="err_app">
                {t('f1_plans:err_app_submissions')}
              </TabsTrigger>
              <TabsTrigger value="direct_upload">
                {t('f1_plans:direct_upload.title')}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="err_app" className="mt-6">
              <ERRAppSubmissions />
            </TabsContent>

            <TabsContent value="direct_upload" className="mt-6">
              <DirectUpload />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}
