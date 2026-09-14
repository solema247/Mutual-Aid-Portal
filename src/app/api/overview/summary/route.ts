import { NextResponse } from 'next/server'
import { readSharedRollupCache } from '../rollup/route'

/** Cache duration in milliseconds (3 minutes) */
const CACHE_DURATION_MS = 3 * 60 * 1000

function getCacheKey(allowedStates: string[] | null): string {
  if (!allowedStates || allowedStates.length === 0) return 'all_states'
  return [...allowedStates].sort().join(',')
}

/**
 * Lightweight summary endpoint - returns only KPIs and aggregations (no full rows)
 * Falls back to full rollup if needed
 */
export async function GET(request: Request) {
  const startTime = Date.now()
  
  try {
    const { getUserStateAccess } = await import('@/lib/userStateAccess')
    const { allowedStateNames } = await getUserStateAccess()
    const cacheKey = getCacheKey(allowedStateNames)
    
    // Try to get from cache
    const cached = await readSharedRollupCache(cacheKey)
    
    if (cached) {
      // Extract only the summary data (no rows array)
      const summary = {
        kpis: cached.kpis,
        stateAggregations: cached.stateAggregations,
        roomAggregations: cached.roomAggregations,
        timestamp: new Date().toISOString()
      }
      
      const elapsed = Date.now() - startTime
      console.log(`[summary] Returned cached summary in ${elapsed}ms`)
      return NextResponse.json(summary)
    }
    
    // If no cache, trigger a full rollup rebuild in the background
    // but return a 202 status to indicate the client should try again
    console.log('[summary] No cache found, triggering rebuild')
    
    // Trigger rebuild (don't wait for it)
    const url = new URL(request.url)
    const origin = url.origin
    fetch(`${origin}/api/overview/rollup`).catch(e => 
      console.error('[summary] Background rollup failed:', e)
    )
    
    return NextResponse.json(
      { message: 'Building summary, please retry in a moment' },
      { status: 202 }
    )
  } catch (e) {
    console.error('[summary] error', e)
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 })
  }
}
