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

export default function ActiveRoomsList({ isLoading: initialLoading }: { isLoading: boolean }) {
  const { t } = useTranslation(['rooms'])
  const [rooms, setRooms] = useState<RoomWithState[]>([])
  const [isLoading, setIsLoading] = useState(initialLoading)
  const [error, setError] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<'all' | 'state' | 'base'>('all')
  const [selectedState, setSelectedState] = useState<string>('all')
  const [selectedLocality, setSelectedLocality] = useState<string>('all')
  const [states, setStates] = useState<{id: string, name: string, localities: string[]}[]>([])
  const [localities, setLocalities] = useState<string[]>([])

  const fetchRooms = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const { rooms: fetchedRooms } = await getActiveRooms({
        page: 1,
        pageSize: 100,
        type: selectedType === 'all' ? undefined : selectedType
      })
      
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
            .filter(room => room.state)
            .map(room => ({ 
              id: room.state?.id || '', 
              name: room.state?.state_name || '',
              locality: room.state?.locality || ''
            }))
        )
      ).reduce((acc, { id, name, locality }) => {
        const existingState = acc.find(s => s.id === id);
        if (existingState) {
          if (!existingState.localities.includes(locality)) {
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
        setLocalities(stateObj?.localities || []);
      } else {
        const allLocalities = Array.from(
          new Set(
            fetchedRooms
              .filter(room => room.state?.locality)
              .map(room => room.state?.locality || '')
          )
        );
        setLocalities(allLocalities);
      }
      
      setRooms(filteredRooms)
    } catch (err) {
      console.error('Error fetching active rooms:', err)
      setError('Failed to fetch rooms')
    } finally {
      setIsLoading(false)
    }
  }, [selectedType, selectedState, selectedLocality])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // Update localities when state changes
  useEffect(() => {
    if (selectedState !== 'all') {
      const stateObj = states.find(s => s.id === selectedState);
      setLocalities(stateObj?.localities || []);
      setSelectedLocality('all'); // Reset locality selection
    }
  }, [selectedState, states]);

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
            {states.map((state) => (
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
            {localities.map((locality) => (
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
                <div>{room.name}</div>
                <div>{t(`rooms:${room.type}_type`)}</div>
                <div>{room.state?.state_name}</div>
                <div>{room.state?.locality}</div>
                <div>{new Date(room.created_at || '').toLocaleDateString()}</div>
                <div>-</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
} 