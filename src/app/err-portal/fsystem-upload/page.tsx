'use client'

import { useTranslation } from 'react-i18next'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import F1Upload from './components/F1Upload'

export default function FSystemUploadPage() {
  const { t } = useTranslation(['common', 'fsystem'])

  return (
    <div className="container mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">{t('fsystem:upload.title')}</h1>
        <p className="text-muted-foreground">{t('fsystem:upload.description')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('fsystem:upload.form_type')}</CardTitle>
          <CardDescription>{t('fsystem:upload.form_type_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="f1" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="f1">{t('fsystem:f1.title')}</TabsTrigger>
              <TabsTrigger value="f4">{t('fsystem:f4.title')}</TabsTrigger>
              <TabsTrigger value="f5">{t('fsystem:f5.title')}</TabsTrigger>
            </TabsList>
            <TabsContent value="f1">
              <F1Upload />
            </TabsContent>
            <TabsContent value="f4">
              <div className="p-4 text-center text-muted-foreground">
                {t('fsystem:f4.coming_soon')}
              </div>
            </TabsContent>
            <TabsContent value="f5">
              <div className="p-4 text-center text-muted-foreground">
                {t('fsystem:f5.coming_soon')}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
} 