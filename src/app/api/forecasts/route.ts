import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const forecasts = await request.json()
    const supabase = createRouteHandlerClient({ cookies })

    // Add logging before the upsert
    console.log('Forecasts to insert:', forecasts.map(f => ({
      state_name: f.state_name,
      month: f.month,
      status: f.status
    })))

    // Upsert forecasts with new conflict handling based on org_name, state_name, month
    const { data, error } = await supabase
      .from('donor_forecasts')
      .upsert(forecasts.map((forecast: any) => {
        console.log('Processing forecast status:', forecast.status)
        return {
          donor_id: forecast.donor_id,
          cluster_id: forecast.cluster_id,
          state_id: forecast.state_id,
          month: forecast.month,
          amount: forecast.amount,
          // Additional fields
          localities: forecast.localities,
          org_name: forecast.org_name,
          intermediary: forecast.intermediary,
          transfer_method: forecast.transfer_method,
          source: forecast.source,
          receiving_mag: forecast.receiving_mag,
          state_name: forecast.state_name,
          status: forecast.status === 'complete' ? 'complete' : 'planned'
        }
      }), {
        onConflict: 'org_name,state_name,month',
        ignoreDuplicates: false
      })

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