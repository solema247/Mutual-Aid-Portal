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
import { RoomWithState } from '@/app/api/rooms/types/rooms'
import { getActiveRooms } from '@/app/api/rooms/utils/rooms'

const PAGE_SIZE = 50; // Increased page size

interface ActiveRoomsListProps {
  isLoading: boolean;
  userRole?: string;
  userErrId?: string | null;
}

export default function ActiveRoomsList({ 
  isLoading: initialLoading,
  userRole = '',
  userErrId = null
}: ActiveRoomsListProps) {
  const { t, i18n } = useTranslation(['rooms'])
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

  const fetchRooms = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const { rooms: fetchedRooms, total } = await getActiveRooms({
        page: currentPage,
        pageSize: PAGE_SIZE,
        type: selectedType === 'all' ? undefined : selectedType,
        currentUserRole: userRole,
        currentUserErrId: userErrId
      })
      
      setTotalRooms(total)
      
      // Apply client-side filtering for state and locality
      let filteredRooms = fetchedRooms;
      
      if (selectedState !== 'all') {
        filteredRooms = filteredRooms.filter(
          room => room.state?.id === selectedState
        );
      }
      
      if (selectedLocality !== 'all') {
        filteredRooms = filteredRooms.filter(
          room => room.state?.locality === selectedLocality
        );
      }

      // Extract unique states and localities for filters
      const uniqueStates = Array.from(
        new Set(
          fetchedRooms
            .filter(room => room.state && room.state.id)
            .map(room => ({ 
              id: room.state?.id || '', 
              name: i18n.language === 'ar' ? (room.state?.state_name_ar || room.state?.state_name || '') : (room.state?.state_name || ''),
              locality: i18n.language === 'ar' ? (room.state?.locality_ar || room.state?.locality || '') : (room.state?.locality || '')
            }))
        )
      ).reduce((acc, { id, name, locality }) => {
        if (!id) return acc;
        const existingState = acc.find(s => s.id === id);
        if (existingState) {
          if (locality && !existingState.localities.includes(locality)) {
            existingState.localities.push(locality);
          }
        } else {
          acc.push({ id, name, localities: locality ? [locality] : [] });
        }
        return acc;
      }, [] as {id: string, name: string, localities: string[]}[]);
      
      setStates(uniqueStates);
      
      // Update localities when state is selected
      if (selectedState !== 'all') {
        const stateObj = uniqueStates.find(s => s.id === selectedState);
        const validLocalities = (stateObj?.localities || []).filter(locality => locality);
        setLocalities(validLocalities);
      } else {
        const allLocalities = Array.from(
          new Set(
            fetchedRooms
              .filter(room => room.state && (room.state.locality || room.state.locality_ar))
              .map(room => i18n.language === 'ar' ? (room.state?.locality_ar || room.state?.locality || '') : (room.state?.locality || ''))
          )
        ).filter(locality => locality);
        setLocalities(allLocalities);
      }
      
      setRooms(filteredRooms)
    } catch (err) {
      console.error('Error fetching active rooms:', err)
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
      const stateObj = states.find(s => s.id === selectedState);
      setLocalities(stateObj?.localities || []);
      setSelectedLocality('all'); // Reset locality selection
    }
  }, [selectedState, states]);

  const totalPages = Math.ceil(totalRooms / PAGE_SIZE)

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
        <div className="text-muted-foreground">No active rooms found</div>
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
                  <div>-</div>
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