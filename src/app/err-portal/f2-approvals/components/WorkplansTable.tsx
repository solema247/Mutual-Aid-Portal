'use client'

import React, { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Pencil, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { supabase } from '@/lib/supabaseClient'
import type { Workplan } from '../types'

interface WorkplansTableProps {
  selectedWorkplans: string[];
  onSelectWorkplans: (ids: string[]) => void;
  onReassign: (id: string) => void;
  onAdjust: (id: string) => void;
}

export default function WorkplansTable({
  selectedWorkplans,
  onSelectWorkplans,
  onReassign,
  onAdjust
}: WorkplansTableProps) {
  const { t } = useTranslation(['err', 'common'])
  const [workplans, setWorkplans] = useState<Workplan[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const fetchWorkplans = async () => {
      try {
        const { data, error } = await supabase
          .from('err_projects')
          .select(`
            id,
            workplan_number,
            err_id,
            locality,
            "Sector (Primary)",
            requested_amount,
            status,
            funding_status,
            grant_call_id,
            grant_call_state_allocation_id,
            grant_serial_id
          `)
          .eq('status', 'pending')
          .order('workplan_number', { ascending: true })

        if (error) throw error
        
        // Log the first workplan to check data structure
        if (data?.length > 0) {
          console.log('First workplan data:', data[0])
        }

        // Validate workplan data before setting
        const validWorkplans = data?.filter(w => {
          const isValid = w && typeof w === 'object' && 'id' in w
          if (!isValid) {
            console.warn('Invalid workplan data:', w)
          }
          return isValid
        }) || []

        setWorkplans(validWorkplans)
      } catch (error) {
        console.error('Error fetching workplans:', error)
        setWorkplans([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchWorkplans()
  }, [])

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectWorkplans(workplans.map((w: Workplan) => w.id))
    } else {
      onSelectWorkplans([])
    }
  }

  const handleSelectWorkplan = (id: string, checked: boolean) => {
    if (checked) {
      onSelectWorkplans([...selectedWorkplans, id])
    } else {
      onSelectWorkplans(selectedWorkplans.filter(wId => wId !== id))
    }
  }

  if (isLoading) {
    return <div className="text-center py-4">Loading...</div>
  }

  return (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[50px]">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300"
                checked={selectedWorkplans.length === workplans.length}
                onChange={(e) => handleSelectAll(e.target.checked)}
              />
            </TableHead>
            <TableHead>{t('err:f2.workplan_number')}</TableHead>
            <TableHead>{t('err:f2.err_id')}</TableHead>
            <TableHead>{t('err:f2.locality')}</TableHead>
            <TableHead>{t('err:f2.sector_primary')}</TableHead>
            <TableHead className="text-right">{t('err:f2.requested_amount')}</TableHead>
            <TableHead>{t('err:f2.status')}</TableHead>
            <TableHead className="w-[100px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {workplans.map((workplan: Workplan) => (
            <TableRow key={workplan.id}>
              <TableCell>
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-gray-300"
                  checked={selectedWorkplans.includes(workplan.id)}
                  onChange={(e) => handleSelectWorkplan(workplan.id, e.target.checked)}
                />
              </TableCell>
              <TableCell>{workplan.workplan_number}</TableCell>
              <TableCell>{workplan.err_id}</TableCell>
              <TableCell>{workplan.locality}</TableCell>
              <TableCell>{workplan["Sector (Primary)"]}</TableCell>
              <TableCell className="text-right">
                {workplan.requested_amount ? workplan.requested_amount.toLocaleString() : '0'}
              </TableCell>
              <TableCell>
                <span className={
                  workplan.status === 'approved' 
                    ? 'text-green-600' 
                    : 'text-amber-600'
                }>
                  {t(`err:f2.status_${workplan.status}`)}
                </span>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onReassign(workplan.id)}
                    title={t('err:f2.reassign')}
                  >
                    <ArrowRightLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onAdjust(workplan.id)}
                    title={t('err:f2.adjust')}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
