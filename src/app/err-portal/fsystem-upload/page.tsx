'use client'

import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import F1Upload from './components/F1Upload'

export default function FSystemUploadPage() {
  const { t } = useTranslation(['common', 'err'])

  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('err:fsystem_upload')}</h1>
        <p className="text-muted-foreground">{t('err:fsystem_upload_desc')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Select Form Type</CardTitle>
          <CardDescription>Choose the type of form you want to upload</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="f1" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="f1">F1 Form</TabsTrigger>
              <TabsTrigger value="f4">F4 Form</TabsTrigger>
              <TabsTrigger value="f5">F5 Form</TabsTrigger>
            </TabsList>
            <TabsContent value="f1">
              <F1Upload />
            </TabsContent>
            <TabsContent value="f4">
              <div className="p-4 text-center text-muted-foreground">
                F4 form upload coming soon
              </div>
            </TabsContent>
            <TabsContent value="f5">
              <div className="p-4 text-center text-muted-foreground">
                F5 form upload coming soon
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 