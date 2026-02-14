'use client'

import { useTranslation } from 'react-i18next'
import { useState, useEffect, useCallback } from 'react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { RoomWithState } from '@/app/api/rooms/types/rooms'
import { getInactiveRooms, deleteRoom } from '@/app/api/rooms/utils/rooms'
import { useAllowedFunctions } from '@/hooks/useAllowedFunctions'
import { Trash2 } from 'lucide-react'

const PAGE_SIZE = 50

interface InactiveRoomsListProps {
  isLoading: boolean
  userRole?: string
  userErrId?: string | null
}

export default function InactiveRoomsList({ 
  isLoading: initialLoading,
  userRole = '',
  userErrId = null
}: InactiveRoomsListProps) {
  const { t, i18n } = useTranslation(['rooms', 'common'])
  const { can } = useAllowedFunctions()
  const [rooms, setRooms] = useState<RoomWithState[]>([])
  const [isLoading, setIsLoading] = useState(initialLoading)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'all' | 'state' | 'base'>('all')
  const [selectedState, setSelectedState] = useState<string>('all')
  const [selectedLocality, setSelectedLocality] = useState<string>('all')
  const [states, setStates] = useState<{id: string, name: string, localities: string[]}[]>([])
  const [localities, setLocalities] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRooms, setTotalRooms] = useState(0)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchRooms = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const { rooms: fetchedRooms, total } = await getInactiveRooms({
        page: currentPage,
        pageSize: PAGE_SIZE,
        type: selectedType === 'all' ? undefined : selectedType,
        currentUserRole: userRole,
        currentUserErrId: userErrId
      })
      
      setTotalRooms(total)
      
      // Apply client-side filtering for state and locality
      let filteredRooms = fetchedRooms
      
      if (selectedState !== 'all') {
        const selectedStateName = fetchedRooms.find(r => r.state?.id === selectedState)?.state?.state_name
        
        if (selectedStateName) {
          filteredRooms = filteredRooms.filter(
            room => room.state?.state_name === selectedStateName
          )
        }
      }
      
      if (selectedLocality !== 'all') {
        filteredRooms = filteredRooms.filter(
          room => room.state?.locality === selectedLocality
        )
      }

      // Extract unique states and localities for filters
      // Group by state_name instead of state.id to avoid duplicates
      const stateMap = new Map<string, {id: string, name: string, localities: string[]}>()
      
      fetchedRooms
        .filter(room => room.state && room.state.state_name)
        .forEach(room => {
          const stateName = room.state?.state_name || ''
          const stateNameDisplay = i18n.language === 'ar' 
            ? (room.state?.state_name_ar || room.state?.state_name || '') 
            : (room.state?.state_name || '')
          const locality = i18n.language === 'ar' 
            ? (room.state?.locality_ar || room.state?.locality || '') 
            : (room.state?.locality || '')
          
          if (!stateName) return
          
          if (!stateMap.has(stateName)) {
            stateMap.set(stateName, {
              id: room.state?.id || '',
              name: stateNameDisplay,
              localities: locality ? [locality] : []
            })
          } else {
            const existing = stateMap.get(stateName)!
            if (locality && !existing.localities.includes(locality)) {
              existing.localities.push(locality)
            }
          }
        })
      
      const uniqueStates = Array.from(stateMap.values())
      
      setStates(uniqueStates)
      
      // Update localities when state is selected
      if (selectedState !== 'all') {
        const stateObj = uniqueStates.find(s => s.id === selectedState)
        const validLocalities = (stateObj?.localities || []).filter(locality => locality)
        setLocalities(validLocalities)
      } else {
        const allLocalities = Array.from(
          new Set(
            fetchedRooms
              .filter(room => room.state && (room.state.locality || room.state.locality_ar))
              .map(room => i18n.language === 'ar' ? (room.state?.locality_ar || room.state?.locality || '') : (room.state?.locality || ''))
          )
        ).filter(locality => locality)
        setLocalities(allLocalities)
      }
      
      setRooms(filteredRooms)
    } catch (err) {
      console.error('Error fetching inactive rooms:', err)
      setError('Failed to fetch rooms')
    } finally {
      setIsLoading(false)
    }
  }, [selectedType, selectedState, selectedLocality, currentPage, userRole, userErrId, i18n.language])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedType, selectedState, selectedLocality])

  // Update localities when state changes
  useEffect(() => {
    if (selectedState !== 'all') {
      const stateObj = states.find(s => s.id === selectedState)
      setLocalities(stateObj?.localities || [])
      setSelectedLocality('all')
    }
  }, [selectedState, states])

  const totalPages = Math.ceil(totalRooms / PAGE_SIZE)

  const handleDelete = async (roomId: string) => {
    if (!confirm(t('rooms:delete_room_confirmation'))) {
      return
    }

    setProcessingId(roomId)
    try {
      await deleteRoom(roomId)
      fetchRooms()
    } catch (error: any) {
      console.error('Error deleting room:', error)
      alert('Failed to delete room: ' + (error.message || 'Unknown error'))
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <Select
          value={selectedType}
          onValueChange={(value: 'all' | 'state' | 'base') => setSelectedType(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('rooms:filter_by_type')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('rooms:all_types')}</SelectItem>
            <SelectItem value="state">{t('rooms:state_type')}</SelectItem>
            <SelectItem value="base">{t('rooms:base_type')}</SelectItem>
          </SelectContent>
        </Select>
        
        <Select
          value={selectedState}
          onValueChange={(value) => setSelectedState(value)}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('rooms:filter_by_state')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('rooms:all_states')}</SelectItem>
            {states.filter(state => state.name).map((state) => (
              <SelectItem key={state.id} value={state.id}>{state.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        
        <Select
          value={selectedLocality}
          onValueChange={(value) => setSelectedLocality(value)}
          disabled={localities.length === 0}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder={t('rooms:filter_by_locality')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('rooms:all_localities')}</SelectItem>
            {localities.filter(locality => locality).map((locality) => (
              <SelectItem key={locality} value={locality}>{locality}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading && <div className="text-muted-foreground">{t('rooms:loading')}</div>}
      
      {error && (
        <div className="text-destructive text-sm">{error}</div>
      )}

      {!isLoading && !error && rooms.length === 0 && (
        <div className="text-muted-foreground">{t('rooms:no_inactive_rooms')}</div>
      )}

      {!isLoading && !error && rooms.length > 0 && (
        <>
          <div className="rounded-md border">
            <div className="grid grid-cols-6 gap-4 p-4 font-medium border-b">
              <div>{t('rooms:name')}</div>
              <div>{t('rooms:type')}</div>
              <div>{t('rooms:state')}</div>
              <div>{t('rooms:locality')}</div>
              <div>{t('rooms:created_at')}</div>
              <div>{t('rooms:actions')}</div>
            </div>
            <div className="divide-y">
              {rooms.map((room) => (
                <div key={room.id} className="grid grid-cols-6 gap-4 p-4">
                  <div>{i18n.language === 'ar' && room.name_ar ? room.name_ar : room.name}</div>
                  <div>{t(`rooms:${room.type}_type`)}</div>
                  <div>{i18n.language === 'ar' ? room.state?.state_name_ar : room.state?.state_name}</div>
                  <div>{i18n.language === 'ar' ? room.state?.locality_ar : room.state?.locality}</div>
                  <div>{new Date(room.created_at || '').toLocaleDateString()}</div>
                  <div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(room.id)}
                      disabled={processingId === room.id || !can('rooms_delete')}
                      title={!can('rooms_delete') ? t('common:no_permission') : t('rooms:delete')}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between px-2">
            <div className="text-sm text-muted-foreground">
              {t('rooms:showing_results', {
                from: ((currentPage - 1) * PAGE_SIZE) + 1,
                to: Math.min(currentPage * PAGE_SIZE, totalRooms),
                total: totalRooms
              })}
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-2 text-sm font-medium rounded-md border disabled:opacity-50"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                {t('rooms:previous')}
              </button>
              <button
                className="px-3 py-2 text-sm font-medium rounded-md border disabled:opacity-50"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                {t('rooms:next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

