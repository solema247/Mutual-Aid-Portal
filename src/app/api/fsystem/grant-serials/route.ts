import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabaseClient'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const grant_call_id = searchParams.get('grant_call_id')
  const state_name = searchParams.get('state_name')
  const yymm = searchParams.get('yymm')

  if (!grant_call_id || !state_name || !yymm) {
    return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 })
  }

  try {
    const { data, error } = await supabase
      .from('grant_serials')
      .select('*')
      .eq('grant_call_id', grant_call_id)
      .eq('state_name', state_name)
      .eq('yymm', yymm)

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    console.error('Error fetching grant serials:', error)
    return NextResponse.json({ error: 'Failed to fetch grant serials' }, { status: 500 })
  }
}
