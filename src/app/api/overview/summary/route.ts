import { NextResponse } from 'next/server'
import { readSharedRollupCache } from '../rollup/route'
import { getUserGrantAccess } from '@/lib/userGrantAccess'
import { getUserRoomAccess } from '@/lib/userRoomAccess'

function getCacheKey(allowedStates: string[] | null): string {
  if (!allowedStates || allowedStates.length === 0) return 'all_states'
  return [...allowedStates].sort().join(',')
}

/** Same KPI fields as the rollup empty payload, without project rows. */
function emptySummary() {
  return {
    kpis: {
      projects: 0,
      plan: 0,
      actual: 0,
      variance: 0,
      burn: 0,
      f4_count: 0,
      last_report_date: null,
      f5_count: 0,
      last_f5_date: null,
      f5_total_individuals: 0,
      f5_total_families: 0,
    },
    stateAggregations: [] as unknown[],
    roomAggregations: [] as unknown[],
    timestamp: new Date().toISOString(),
  }
}

function summaryFromCache(cached: { kpis?: unknown; stateAggregations?: unknown; roomAggregations?: unknown }) {
  return {
    kpis: cached.kpis,
    stateAggregations: cached.stateAggregations,
    roomAggregations: cached.roomAggregations,
    timestamp: new Date().toISOString(),
  }
}

/**
 * Partner rollup cache key. Must match getCacheKey(null, partnerScope) in overview/rollup:
 * v3|all_states|partner:{opsPartnerId}:{sorted grant IDs}
 */
function partnerRollupCacheKey(opsPartnerId: string, grantGridIds: string[]): string {
  const grantScopeKey = `partner:${opsPartnerId}:${[...grantGridIds].sort().join(',')}`
  return `v3|all_states|${grantScopeKey}`
}

/**
 * Base ERR rollup cache key. Must match getCacheKey(null, 'all_grants', roomAccessCacheKey)
 * in overview/rollup: v3|all_states|all_grants|room:base_err:{roomId}
 */
function roomRollupCacheKey(emergencyRoomId: string): string {
  return `v3|all_states|all_grants|room:base_err:${emergencyRoomId}`
}

/**
 * Lightweight summary endpoint - returns only KPIs and aggregations (no full rows)
 * Falls back to full rollup if needed
 */
export async function GET(request: Request) {
  const startTime = Date.now()
  
  try {
    const [grantAccess, roomAccess] = await Promise.all([
      getUserGrantAccess(),
      getUserRoomAccess(),
    ])

    if (roomAccess.mode === 'none') {
      return NextResponse.json(emptySummary())
    }

    if (roomAccess.mode === 'room') {
      const cached = await readSharedRollupCache(roomRollupCacheKey(roomAccess.emergencyRoomId))
      if (!cached) {
        // Build the room-scoped rollup so the next poll can serve it
        const url = new URL(request.url)
        fetch(`${url.origin}/api/overview/rollup`, {
          headers: { cookie: request.headers.get('cookie') ?? '' },
        }).catch((e) => console.error('[summary] background room rollup failed:', e))
        return NextResponse.json(
          { message: 'Building summary, please retry in a moment' },
          { status: 202 }
        )
      }
      return NextResponse.json(summaryFromCache(cached))
    }

    if (grantAccess.mode === 'none') {
      return NextResponse.json(emptySummary())
    }

    if (grantAccess.mode === 'partner') {
      const cacheKey = partnerRollupCacheKey(grantAccess.opsPartnerId, grantAccess.grantGridIds)
      const cached = await readSharedRollupCache(cacheKey)
      if (!cached) {
        return NextResponse.json(emptySummary())
      }
      const elapsed = Date.now() - startTime
      console.log(`[summary] Returned partner cached summary in ${elapsed}ms`)
      return NextResponse.json(summaryFromCache(cached))
    }

    const { getUserStateAccess } = await import('@/lib/userStateAccess')
    const { allowedStateNames } = await getUserStateAccess()
    const cacheKey = getCacheKey(allowedStateNames)
    
    // Try to get from cache
    const cached = await readSharedRollupCache(cacheKey)
    
    if (cached) {
      // Extract only the summary data (no rows array)
      const summary = summaryFromCache(cached)
      
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
