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
    }
  }
} 