import type { SupabaseClient } from '@supabase/supabase-js'

export type GrantSegment = {
  id: string
  code: string
  label_en: string
  label_ar: string | null
  sort_order: number
}

export async function fetchActiveGrantSegments (
  client: SupabaseClient
): Promise<GrantSegment[]> {
  const { data, error } = await client
    .from('grant_segments')
    .select('id, code, label_en, label_ar, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  if (error) throw error
  return (data ?? []) as GrantSegment[]
}
