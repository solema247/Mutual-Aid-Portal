'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { supabase } from '@/lib/supabaseClient'
import {
  AllocationHeader,
  WorkplansTable,
  FooterActions,
  ReassignModal,
  AdjustModal
} from './components'

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
  const [selectedWorkplans, setSelectedWorkplans] = useState<string[]>([])
  const [reassignModalOpen, setReassignModalOpen] = useState(false)
  const [adjustModalOpen, setAdjustModalOpen] = useState(false)
  const [activeWorkplan, setActiveWorkplan] = useState<string | null>(null)
  const [selectedGrantCall, setSelectedGrantCall] = useState<string | null>(null)
  const [selectedAllocation, setSelectedAllocation] = useState<string | null>(null)

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error: sessionError } = await supabase.auth.getSession()
        
        if (sessionError || !session) {
          router.push('/login')
          return
        }

        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', session.user.id)
          .single()

        if (userError || !userData) {
          console.error('Error fetching user data:', userError)
          router.push('/login')
          return
        }

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

      <Card className="p-6">
        <AllocationHeader 
          onGrantSelect={setSelectedGrantCall}
          onStateSelect={setSelectedAllocation}
        />
      </Card>

      {selectedAllocation ? (
        <>
          <Card className="p-6 space-y-4">
            <WorkplansTable
              grantCallId={selectedGrantCall}
              allocationId={selectedAllocation}
              selectedWorkplans={selectedWorkplans}
              onSelectWorkplans={setSelectedWorkplans}
              onReassign={(id: string) => {
                setActiveWorkplan(id)
                setReassignModalOpen(true)
              }}
              onAdjust={(id: string) => {
                setActiveWorkplan(id)
                setAdjustModalOpen(true)
              }}
            />
            <FooterActions
              selectedWorkplans={selectedWorkplans}
              onClearSelection={() => setSelectedWorkplans([])}
            />
          </Card>

          <ReassignModal
            open={reassignModalOpen}
            onOpenChange={setReassignModalOpen}
            workplanId={activeWorkplan}
          />

          <AdjustModal
            open={adjustModalOpen}
            onOpenChange={setAdjustModalOpen}
            workplanId={activeWorkplan}
            onAdjust={() => {
              // Trigger a refresh of the workplans table
              const workplansTable = document.querySelector('div[data-testid="workplans-table"]')
              if (workplansTable) {
                const event = new Event('refresh')
                workplansTable.dispatchEvent(event)
              }
            }}
          />
        </>
      ) : null}
    </div>
  )
}
