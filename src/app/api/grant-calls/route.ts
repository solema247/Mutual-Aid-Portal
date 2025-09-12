import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')

    let query = supabase
      .from('grant_calls')
      .select(`
        id,
        name,
        shortname,
        amount,
        status,
        start_date,
        end_date,
        donor:donors (
          id,
          name,
          short_name
        )
      `)
      .order('created_at', { ascending: false })

    if (status) {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching grant calls:', error)
    return NextResponse.json({ error: 'Failed to fetch grant calls' }, { status: 500 })
  }
}
