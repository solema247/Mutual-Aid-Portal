import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const forecasts = await request.json()
    const supabase = createRouteHandlerClient({ cookies })

    // Insert forecasts with new fields
    const { data, error } = await supabase
      .from('donor_forecasts')
      .insert(forecasts.map((forecast: any) => ({
        donor_id: forecast.donor_id,
        cluster_id: forecast.cluster_id,
        state_id: forecast.state_id,
        month: forecast.month,
        amount: forecast.amount,
        // New fields
        localities: forecast.localities,
        org_name: forecast.org_name,
        intermediary: forecast.intermediary,
        transfer_method: forecast.transfer_method,
        source: forecast.source,
        receiving_mag: forecast.receiving_mag,
        state_name: forecast.state_name
      })))

    if (error) {
      console.error('Supabase error:', error)
      return new NextResponse(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    return new NextResponse(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('API error:', err)
    return new NextResponse(JSON.stringify({ error: 'Failed to process request' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
} 