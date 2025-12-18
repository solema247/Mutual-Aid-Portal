'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { supabase } from '@/lib/supabaseClient'
import PoolDashboard from '../f1-work-plans/components/PoolDashboard'
import UncommittedF1sTab from './components/UncommittedF1sTab'
import CommittedF1sTab from './components/CommittedF1sTab'

interface User {
  id: string;
  auth_user_id: string;
  display_name: string;
  role: string;
  status: string;
  err_id: string | null;
}

export default function F2ApprovalsPage() {
  const { t } = useTranslation(['f2', 'common'])
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [currentTab, setCurrentTab] = useState<'uncommitted' | 'committed'>('uncommitted')

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/users/me')
        
        if (!res.ok) {
          if (res.status === 401) {
            router.push('/login')
            return
          }
          throw new Error('Failed to fetch user data')
        }

        const userData = await res.json()

        if (userData.status !== 'active') {
          console.error('User account is not active')
          router.push('/login')
          return
        }

        setUser(userData)
      } catch (error) {
        console.error('Auth check error:', error)
        router.push('/login')
      } finally {
        setIsLoading(false)
      }
    }

    checkAuth()
  }, [router])

  if (isLoading) return <div>Loading...</div>

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-semibold">{t('f2:title')}</h2>
        <Button 
          variant="outline" 
          onClick={() => router.push('/err-portal')}
        >
          {t('common:back')}
        </Button>
      </div>

      {/* Allocation overview dashboard (by State and by Donor/Grant) */}
      <Card>
        <CardHeader>
          <CardTitle>{t('f2:allocation_overview')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PoolDashboard showProposals={false} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('f2:page_header')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs 
            defaultValue="uncommitted" 
            className="w-full" 
            onValueChange={(value) => setCurrentTab(value as 'uncommitted' | 'committed')}
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="uncommitted">{t('f2:uncommitted_tab')}</TabsTrigger>
              <TabsTrigger value="committed">{t('f2:committed_tab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="uncommitted" className="mt-6">
              <UncommittedF1sTab />
            </TabsContent>

            <TabsContent value="committed" className="mt-6">
              <CommittedF1sTab />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}