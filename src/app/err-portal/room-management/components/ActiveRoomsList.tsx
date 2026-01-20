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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { RoomWithState } from '@/app/api/rooms/types/rooms'
import { getActiveRooms, deactivateRoom, updateRoomStateReference } from '@/app/api/rooms/utils/rooms'
import { supabase } from '@/lib/supabaseClient'
import { Pencil, X } from 'lucide-react'

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
  const [states, setStates] = useState<{id: string, name: string}[]>([])
  const [currentPage, setCurrentPage] = useState(1)
  const [totalRooms, setTotalRooms] = useState(0)
  const [modifyDialogOpen, setModifyDialogOpen] = useState(false)
  const [selectedRoom, setSelectedRoom] = useState<RoomWithState | null>(null)
  const [modifyStateId, setModifyStateId] = useState<string>('')
  const [modifyLocalityId, setModifyLocalityId] = useState<string>('')
  const [modifyStates, setModifyStates] = useState<Array<{id: string, name: string, name_ar: string | null, state_name: string}>>([])
  const [modifyLocalities, setModifyLocalities] = useState<Array<{id: string, locality: string | null, locality_ar: string | null}>>([])
  const [isModifying, setIsModifying] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)

  const fetchRooms = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)
      
      const { rooms: fetchedRooms, total } = await getActiveRooms({
        page: currentPage,
        pageSize: PAGE_SIZE,
        type: selectedType === 'all' ? undefined : selectedType,
        stateId: selectedState !== 'all' ? selectedState : undefined,
        currentUserRole: userRole,
        currentUserErrId: userErrId
      })
      
      setTotalRooms(total)
      setRooms(fetchedRooms)
    } catch (err) {
      console.error('Error fetching active rooms:', err)
      setError('Failed to fetch rooms')
    } finally {
      setIsLoading(false)
    }
  }, [selectedType, selectedState, currentPage, userRole, userErrId, i18n.language])

  // Fetch unique states for filter dropdown (only once on mount and language change)
  useEffect(() => {
    const fetchStates = async () => {
      try {
        const { data: statesData, error: statesError } = await supabase
          .from('emergency_rooms')
          .select(`
            state:states!emergency_rooms_state_reference_fkey(
              id,
              state_name,
              state_name_ar
            )
          `)
          .eq('status', 'active')
          .not('state_reference', 'is', null)

        if (!statesError && statesData) {
          const stateMap = new Map<string, {id: string, name: string}>()
          
          statesData.forEach((room: any) => {
            const state = room.state
            if (state && state.state_name) {
              if (!stateMap.has(state.state_name)) {
                const stateNameDisplay = i18n.language === 'ar' 
                  ? (state.state_name_ar || state.state_name || '') 
                  : (state.state_name || '')
                
                stateMap.set(state.state_name, {
                  id: state.id,
                  name: stateNameDisplay
                })
              }
            }
          })
          
          const uniqueStates = Array.from(stateMap.values())
          setStates(uniqueStates)
        }
      } catch (error) {
        console.error('Error fetching states:', error)
      }
    }

    fetchStates()
  }, [i18n.language])

  useEffect(() => {
    fetchRooms()
  }, [fetchRooms])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [selectedType, selectedState])

  const totalPages = Math.ceil(totalRooms / PAGE_SIZE)

  // Fetch all states for modify dialog
  useEffect(() => {
    const fetchStates = async () => {
      if (!modifyDialogOpen) return
      
      try {
        const { data: statesData, error } = await supabase
          .from('states')
          .select('id, state_name, state_name_ar')
          .not('state_name', 'is', null)
          .order('state_name')

        if (error) throw error

        // Get unique states by state_name
        const stateMap = new Map<string, {id: string, name: string, name_ar: string | null, state_name: string}>()
        statesData?.forEach((state: any) => {
          if (!stateMap.has(state.state_name)) {
            stateMap.set(state.state_name, {
              id: state.id,
              name: i18n.language === 'ar' ? (state.state_name_ar || state.state_name) : state.state_name,
              name_ar: state.state_name_ar,
              state_name: state.state_name
            })
          }
        })

        const uniqueStates = Array.from(stateMap.values())
        setModifyStates(uniqueStates)

        // Set initial state if room is selected
        if (selectedRoom?.state?.state_name) {
          const matchingState = uniqueStates.find(s => s.state_name === selectedRoom.state?.state_name)
          if (matchingState) {
            setModifyStateId(matchingState.id)
          }
        }
      } catch (error) {
        console.error('Error fetching states:', error)
      }
    }

    fetchStates()
  }, [modifyDialogOpen, i18n.language])

  // Fetch localities when state is selected in modify dialog
  useEffect(() => {
    const fetchLocalities = async () => {
      if (!modifyStateId || !modifyDialogOpen) {
        setModifyLocalities([])
        setModifyLocalityId('')
        return
      }

      try {
        const selectedState = modifyStates.find(s => s.id === modifyStateId)
        if (!selectedState) return

        // Get state_name from the selected state
        const { data: stateRow } = await supabase
          .from('states')
          .select('state_name')
          .eq('id', modifyStateId)
          .single()

        if (!stateRow) return

        // Fetch all state rows with the same state_name
        const { data: stateRows, error } = await supabase
          .from('states')
          .select('id, locality, locality_ar')
          .eq('state_name', stateRow.state_name)
          .order('locality')

        if (error) throw error

        // Create unique localities list
        const localityMap = new Map<string, {id: string, locality: string | null, locality_ar: string | null}>()
        stateRows?.forEach((row: any) => {
          const localityKey = row.locality || 'null'
          if (!localityMap.has(localityKey)) {
            localityMap.set(localityKey, {
              id: row.id,
              locality: row.locality,
              locality_ar: row.locality_ar
            })
          }
        })

        const localities = Array.from(localityMap.values())
        setModifyLocalities(localities)

        // If room has a locality, try to match it
        if (selectedRoom?.state?.locality) {
          const matchingLocality = localities.find(l => 
            l.locality === selectedRoom.state?.locality || 
            l.locality_ar === selectedRoom.state?.locality_ar
          )
          if (matchingLocality) {
            setModifyLocalityId(matchingLocality.id)
          } else if (localities.length === 1) {
            setModifyLocalityId(localities[0].id)
          }
        } else if (localities.length === 1) {
          setModifyLocalityId(localities[0].id)
        }
      } catch (error) {
        console.error('Error fetching localities:', error)
      }
    }

    fetchLocalities()
  }, [modifyStateId, modifyDialogOpen, modifyStates, selectedRoom, i18n.language])

  const handleModify = (room: RoomWithState) => {
    setSelectedRoom(room)
    setModifyDialogOpen(true)
    
    // Set initial state if states are already loaded
    if (modifyStates.length > 0 && room.state?.state_name) {
      const matchingState = modifyStates.find(s => s.state_name === room.state?.state_name)
      if (matchingState) {
        setModifyStateId(matchingState.id)
      }
    }
  }

  const handleModifySubmit = async () => {
    if (!selectedRoom || !modifyLocalityId) {
      alert('Please select both state and locality')
      return
    }

    setIsModifying(true)
    try {
      await updateRoomStateReference(selectedRoom.id, modifyLocalityId)
      setModifyDialogOpen(false)
      setSelectedRoom(null)
      setModifyStateId('')
      setModifyLocalityId('')
      fetchRooms() // Refresh the list
    } catch (error: any) {
      console.error('Error modifying room:', error)
      alert('Failed to modify room: ' + (error.message || 'Unknown error'))
    } finally {
      setIsModifying(false)
    }
  }

  const handleDeactivate = async (roomId: string) => {
    if (!confirm('Are you sure you want to deactivate this room?')) {
      return
    }

    setProcessingId(roomId)
    try {
      await deactivateRoom(roomId)
      fetchRooms() // Refresh the list
    } catch (error: any) {
      console.error('Error deactivating room:', error)
      alert('Failed to deactivate room: ' + (error.message || 'Unknown error'))
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
            <div className="grid grid-cols-7 gap-4 p-4 font-medium border-b">
              <div>{t('rooms:name')}</div>
              <div>{t('rooms:err_code')}</div>
              <div>{t('rooms:type')}</div>
              <div>{t('rooms:state')}</div>
              <div>{t('rooms:locality')}</div>
              <div>{t('rooms:created_at')}</div>
              <div>{t('rooms:actions')}</div>
            </div>
            <div className="divide-y">
              {rooms.map((room) => (
                <div key={room.id} className="grid grid-cols-7 gap-4 p-4">
                  <div>{i18n.language === 'ar' && room.name_ar ? room.name_ar : room.name}</div>
                  <div>{room.err_code || '—'}</div>
                  <div>{t(`rooms:${room.type}_type`)}</div>
                  <div>{i18n.language === 'ar' ? room.state?.state_name_ar : room.state?.state_name}</div>
                  <div>{i18n.language === 'ar' ? room.state?.locality_ar : room.state?.locality}</div>
                  <div>{new Date(room.created_at || '').toLocaleDateString()}</div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleModify(room)}
                      disabled={processingId === room.id}
                      title={t('rooms:modify')}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDeactivate(room.id)}
                      disabled={processingId === room.id}
                      title={t('rooms:deactivate')}
                    >
                      <X className="h-4 w-4" />
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

      {/* Modify Room Dialog */}
      <Dialog open={modifyDialogOpen} onOpenChange={setModifyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rooms:modify_room')}</DialogTitle>
            <DialogDescription>
              {t('rooms:modify_room_description')}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label>{t('rooms:state')} *</Label>
              <Select
                value={modifyStateId}
                onValueChange={setModifyStateId}
                disabled={isModifying}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t('rooms:select_state')} />
                </SelectTrigger>
                <SelectContent>
                  {modifyStates.map((state) => (
                    <SelectItem key={state.id} value={state.id}>
                      {state.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('rooms:locality')} *</Label>
              <Select
                value={modifyLocalityId}
                onValueChange={setModifyLocalityId}
                disabled={isModifying || !modifyStateId || modifyLocalities.length === 0}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={modifyLocalities.length === 0 ? t('rooms:loading_localities') : t('rooms:select_locality')} />
                </SelectTrigger>
                <SelectContent>
                  {modifyLocalities.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.locality || '(No locality)'} {loc.locality_ar ? `(${loc.locality_ar})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => {
                  setModifyDialogOpen(false)
                  setSelectedRoom(null)
                  setModifyStateId('')
                  setModifyLocalityId('')
                }}
                disabled={isModifying}
              >
                {t('rooms:cancel')}
              </Button>
              <Button
                onClick={handleModifySubmit}
                disabled={isModifying || !modifyStateId || !modifyLocalityId}
              >
                {isModifying ? t('rooms:saving') : t('rooms:save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
} 