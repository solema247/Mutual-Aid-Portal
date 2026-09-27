/** Scoped location filter metadata and client-side cascade helpers for F4/F5 lists. */

export type LocalityFilterOption = { value: string; label: string; state: string }
export type RoomFilterOption = { value: string; label: string; state: string; locality: string }

export type ReportingLocationFilterMeta = {
  localities: LocalityFilterOption[]
  rooms: RoomFilterOption[]
}

export function buildLocationFilterMeta(
  rows: {
    base_room_name?: string | null
    state?: string | null
    locality?: string | null
  }[]
): ReportingLocationFilterMeta {
  const localityByKey = new Map<string, LocalityFilterOption>()
  const roomByKey = new Map<string, RoomFilterOption>()

  for (const r of rows) {
    const state = r.state != null ? String(r.state).trim() : ''
    const locality = r.locality != null ? String(r.locality).trim() : ''
    const room = r.base_room_name != null ? String(r.base_room_name).trim() : ''
    if (!state) continue

    if (locality) {
      const locKey = `${state.toLowerCase()}|${locality.toLowerCase()}`
      if (!localityByKey.has(locKey)) {
        localityByKey.set(locKey, { value: locality, label: locality, state })
      }
    }

    if (room) {
      const locNorm = locality || ''
      const roomKey = `${state.toLowerCase()}|${locNorm.toLowerCase()}|${room.toLowerCase()}`
      if (!roomByKey.has(roomKey)) {
        roomByKey.set(roomKey, {
          value: room,
          label: room,
          state,
          locality: locNorm,
        })
      }
    }
  }

  const sortLoc = (a: LocalityFilterOption, b: LocalityFilterOption) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
  const sortRoom = (a: RoomFilterOption, b: RoomFilterOption) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })

  return {
    localities: Array.from(localityByKey.values()).sort(sortLoc),
    rooms: Array.from(roomByKey.values()).sort(sortRoom),
  }
}

function norm(s: string) {
  return s.trim().toLowerCase()
}

function multiFromFilters(filters: { fieldId: string; value: unknown }[], fieldId: string): string[] {
  const f = filters.find((x) => x.fieldId === fieldId)
  if (!f || !Array.isArray(f.value)) return []
  return f.value.map((v) => String(v).trim()).filter(Boolean)
}

/** Narrow locality/room chip options from scoped metadata and selected state/locality. */
export function deriveLocationChipOptions(
  meta: ReportingLocationFilterMeta,
  selectedStates: string[],
  selectedLocalities: string[]
): { locality: { value: string; label: string }[]; base_room: { value: string; label: string }[] } {
  const states = selectedStates.map(norm).filter(Boolean)
  const localities = selectedLocalities.map(norm).filter(Boolean)

  let localityOpts: LocalityFilterOption[] = []
  let roomOpts = meta.rooms

  if (states.length > 0) {
    const stateSet = new Set(states)
    localityOpts = meta.localities.filter((l) => stateSet.has(norm(l.state)))
    roomOpts = roomOpts.filter((r) => stateSet.has(norm(r.state)))
    if (localities.length > 0) {
      const locSet = new Set(localities)
      roomOpts = roomOpts.filter((r) => locSet.has(norm(r.locality)))
    }
  }

  const dedupeRoom = new Map<string, { value: string; label: string }>()
  for (const r of roomOpts) {
    if (!dedupeRoom.has(r.value)) dedupeRoom.set(r.value, { value: r.value, label: r.label })
  }

  return {
    locality: localityOpts.map((l) => ({ value: l.value, label: l.label })),
    base_room: Array.from(dedupeRoom.values()).sort((a, b) =>
      a.label.localeCompare(b.label, undefined, { sensitivity: 'base' })
    ),
  }
}

/** Drop locality/room selections that fall outside the current state/locality scope. */
export function sanitizeLocationActiveFilters<T extends { fieldId: string; value: unknown }>(
  filters: T[],
  meta: ReportingLocationFilterMeta
): T[] {
  const states = multiFromFilters(filters, 'state')
  const derived = deriveLocationChipOptions(meta, states, multiFromFilters(filters, 'locality'))

  const validLocality = new Set(derived.locality.map((o) => o.value))
  const validRoom = new Set(derived.base_room.map((o) => o.value))

  let changed = false
  const next = filters
    .map((f) => {
      if (f.fieldId === 'locality') {
        if (states.length === 0) {
          if (Array.isArray(f.value) && f.value.length > 0) changed = true
          return null
        }
        if (!Array.isArray(f.value)) return f
        const cleaned = f.value.map((v) => String(v).trim()).filter((v) => validLocality.has(v))
        if (cleaned.length !== f.value.length) changed = true
        return cleaned.length ? { ...f, value: cleaned } : null
      }
      if (f.fieldId === 'base_room' && Array.isArray(f.value)) {
        const cleaned = f.value.map((v) => String(v).trim()).filter((v) => validRoom.has(v))
        if (cleaned.length !== f.value.length) changed = true
        return { ...f, value: cleaned }
      }
      return f
    })
    .filter((f): f is T => f != null)

  return changed ? next : filters
}

export function sanitizeLocationListFilters(
  filters: { states: string[]; localities: string[]; baseRooms: string[] },
  meta: ReportingLocationFilterMeta
): { states: string[]; localities: string[]; baseRooms: string[]; changed: boolean } {
  const derived = deriveLocationChipOptions(meta, filters.states, filters.localities)
  const validLoc = new Set(derived.locality.map((o) => o.value))
  const validRoom = new Set(derived.base_room.map((o) => o.value))

  const localities = filters.states.length ? filters.localities.filter((l) => validLoc.has(l)) : []
  const baseRooms = filters.baseRooms.filter((r) => validRoom.has(r))

  const changed =
    localities.length !== filters.localities.length || baseRooms.length !== filters.baseRooms.length

  return { states: filters.states, localities, baseRooms, changed }
}
