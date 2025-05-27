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
  localities?: string | null
  transfer_method?: string | null
  donor_id?: string
  cluster_id?: string
  state_id?: string
  intermediary?: string | null
  org_type?: string | null
  created_by?: string | null
  // Add other forecast properties here
}

// Function to consolidate duplicate forecasts
function consolidateForecasts(forecasts: Forecast[]): Forecast[] {
  const groupedForecasts = new Map<string, Forecast>()

  forecasts.forEach((forecast) => {
    // Normalize all fields that are part of the unique constraint
    const normalizedFields = {
      org_name: (forecast.org_name || '').trim().toLowerCase(),
      state_name: (forecast.state_name || '').trim().toLowerCase(),
      month: (forecast.month || '').trim(),
      receiving_mag: (forecast.receiving_mag || '').trim().toLowerCase(),
      source: (forecast.source || '').trim().toLowerCase(),
      localities: (forecast.localities || '').trim().toLowerCase(),
      transfer_method: (forecast.transfer_method || '').trim().toLowerCase()
    }

    // Create a key from all fields that should be unique
    const key = [
      normalizedFields.org_name,
      normalizedFields.state_name,
      normalizedFields.month,
      normalizedFields.receiving_mag,
      normalizedFields.source,
      normalizedFields.localities,
      normalizedFields.transfer_method
    ].join('|')

    if (groupedForecasts.has(key)) {
      // If we already have this forecast, add the amounts
      const existing = groupedForecasts.get(key)!
      existing.amount = (existing.amount || 0) + (forecast.amount || 0)
    } else {
      // If this is a new unique forecast, add it to the map
      // Keep the original casing and whitespace in the stored forecast
      groupedForecasts.set(key, { 
        ...forecast,
        org_type: forecast.org_type // Explicitly preserve org_type
      })
    }
  })

  // Convert the map back to an array and log the results
  const consolidated = Array.from(groupedForecasts.values())
  console.log('Consolidated forecasts:', consolidated.map(f => ({
    org_name: f.org_name,
    state_name: f.state_name,
    month: f.month,
    receiving_mag: f.receiving_mag,
    source: f.source,
    localities: f.localities,
    transfer_method: f.transfer_method,
    amount: f.amount
  })))

  return consolidated
}

export async function POST(request: Request) {
  try {
    const forecasts: Forecast[] = await request.json()
    const supabase = createRouteHandlerClient({ cookies })

    // Add logging for incoming forecasts
    console.log('Received forecasts:', forecasts.map(f => ({
      donor_id: f.donor_id,
      org_type: f.org_type,
      org_name: f.org_name
    })))

    // Consolidate duplicate forecasts before upserting
    const consolidatedForecasts = consolidateForecasts(forecasts)

    // Add logging for consolidated forecasts
    console.log('Consolidated forecasts:', consolidatedForecasts.map(f => ({
      donor_id: f.donor_id,
      org_type: f.org_type,
      org_name: f.org_name
    })))

    // Upsert consolidated forecasts
    const { data, error } = await supabase
      .from('donor_forecasts')
      .upsert(consolidatedForecasts.map((forecast: Forecast) => ({
        donor_id: forecast.donor_id,
        cluster_id: forecast.cluster_id,
        state_id: forecast.state_id,
        month: forecast.month,
        amount: forecast.amount,
        localities: forecast.localities,
        org_name: forecast.org_name,
        intermediary: forecast.intermediary,
        transfer_method: forecast.transfer_method,
        source: forecast.source,
        receiving_mag: forecast.receiving_mag,
        state_name: forecast.state_name,
        status: forecast.status || 'planned',
        org_type: forecast.org_type
      })), {
        onConflict: 'org_name,state_name,month,receiving_mag,source,localities,transfer_method',
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