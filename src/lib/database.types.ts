export interface Database {
  public: {
    Tables: {
      emergency_rooms: {
        Row: {
          id: string
          name: string
          type: 'state' | 'base'
          created_at: string
          status: 'active' | 'inactive'
          state_id?: string
          is_wrr?: string | null
        }
      }
      states: {
        Row: {
          id: string
          state_name: string
          state_name_ar: string
          locality: string
          locality_ar: string
        }
      }
      grant_segments: {
        Row: {
          id: string
          code: string
          label_en: string
          label_ar: string | null
          sort_order: number
          is_active: boolean
          created_at: string
        }
      }
    }
  }
} 