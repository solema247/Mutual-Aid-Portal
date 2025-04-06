import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const forecasts = await request.json()

    const { data, error } = await supabase
      .from('donor_forecasts')
      .upsert(forecasts, {
        onConflict: 'donor_id,cluster_id,state_id,month',
        ignoreDuplicates: false
      })

    if (error) throw error

    return NextResponse.json({ success: true, data })
  } catch (error) {
    console.error('Error upserting forecasts:', error)
    return NextResponse.json(
      { error: 'Error upserting forecasts' },
      { status: 500 }
    )
  }
} 