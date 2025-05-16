import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

// Add type for forecast object
interface Forecast {
  state_name: string
  month: string
  status: string
  org_name: string
  receiving_mag: string
  source: string
  amount: number
  // Add other forecast properties here
}

// Function to consolidate duplicate forecasts
function consolidateForecasts(forecasts: Forecast[]): Forecast[] {
  const groupedForecasts = new Map<string, Forecast>()

  forecasts.forEach((forecast) => {
    // Create a key from the fields that should be unique
    const key = `${forecast.org_name}-${forecast.state_name}-${forecast.month}-${forecast.receiving_mag}-${forecast.source}`

    if (groupedForecasts.has(key)) {
      // If we already have this forecast, add the amounts
      const existing = groupedForecasts.get(key)!
      existing.amount = (existing.amount || 0) + (forecast.amount || 0)
    } else {
      // If this is a new unique forecast, add it to the map
      groupedForecasts.set(key, { ...forecast })
    }
  })

  // Convert the map back to an array
  return Array.from(groupedForecasts.values())
}

export async function POST(request: Request) {
  try {
    const forecasts: Forecast[] = await request.json()
    const supabase = createRouteHandlerClient({ cookies })

    // Consolidate duplicate forecasts before upserting
    const consolidatedForecasts = consolidateForecasts(forecasts)

    // Add logging for consolidated forecasts
    console.log('Consolidated forecasts to insert:', consolidatedForecasts.map((f: Forecast) => ({
      state_name: f.state_name,
      month: f.month,
      status: f.status,
      amount: f.amount
    })))

    // Upsert consolidated forecasts
    const { data, error } = await supabase
      .from('donor_forecasts')
      .upsert(consolidatedForecasts.map((forecast: any) => {
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
          status: forecast.status || 'planned'
        }
      }), {
        onConflict: 'org_name,state_name,month,receiving_mag,source',
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