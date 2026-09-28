import { createPagesBrowserClient } from '@supabase/auth-helpers-nextjs'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getActivePublic } from '@/lib/sbEnv'

const { url: supabaseUrl, anonKey: supabaseAnonKey } = getActivePublic()

export const supabase: SupabaseClient = createPagesBrowserClient({
  supabaseUrl,
  supabaseKey: supabaseAnonKey,
}) as unknown as SupabaseClient
