import { describe, expect, it } from 'vitest'
import {
  buildLocationFilterMeta,
  deriveLocationChipOptions,
  sanitizeLocationListFilters,
} from './locationFilterMeta'

describe('locationFilterMeta', () => {
  const meta = buildLocationFilterMeta([
    { state: 'Khartoum', locality: 'Omdurman', base_room_name: 'Room A' },
    { state: 'Khartoum', locality: 'Bahri', base_room_name: 'Room B' },
    { state: 'Gedaref', locality: 'Gedaref City', base_room_name: 'Room G' },
  ])

  it('narrows localities by selected state', () => {
    const derived = deriveLocationChipOptions(meta, ['Khartoum'], [])
    expect(derived.locality.map((o) => o.value).sort()).toEqual(['Bahri', 'Omdurman'])
    expect(derived.base_room.map((o) => o.value).sort()).toEqual(['Room A', 'Room B'])
  })

  it('narrows rooms by state and locality', () => {
    const derived = deriveLocationChipOptions(meta, ['Khartoum'], ['Omdurman'])
    expect(derived.base_room.map((o) => o.value)).toEqual(['Room A'])
  })

  it('sanitizes invalid locality when state changes', () => {
    const { localities, baseRooms, changed } = sanitizeLocationListFilters(
      {
        states: ['Gedaref'],
        localities: ['Omdurman'],
        baseRooms: ['Room A'],
      },
      meta
    )
    expect(changed).toBe(true)
    expect(localities).toEqual([])
    expect(baseRooms).toEqual([])
  })

})
