/**
 * Read-only: measure fetchScopedProjectsCached MISS then HIT (same scope).
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import type { F4F5ListScope } from '../src/lib/f4f5/listScope'
import {
  __resetScopedProjectsCacheForTests,
  fetchScopedProjectsCached,
} from '../src/lib/f4f5/scopedProjectsCache'

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '')
  }
}

async function main() {
  loadEnvLocal()
  process.env.F4F5_SCOPE_CACHE_DEBUG = '1'
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_KEY
  if (!url || !key) throw new Error('Missing Supabase env')

  const supabase = createClient(url, key)
  const adminScope: F4F5ListScope = {
    grantAccess: { mode: 'all', partnerId: null, grantGridIds: null, grantIds: null },
    allowedStateNames: null,
    roomAccess: { applies: false, mode: 'n/a', emergencyRoomId: null },
    grantGridIds: null,
    emergencyRoomId: null,
    useStateScope: true,
    isEmpty: false,
  }
  const userId = 'profile-admin-user-id'

  __resetScopedProjectsCacheForTests()

  const t1 = Date.now()
  const first = await fetchScopedProjectsCached(supabase as never, adminScope, userId, 'f4')
  const missMs = Date.now() - t1

  const t2 = Date.now()
  const second = await fetchScopedProjectsCached(supabase as never, adminScope, userId, 'f5')
  const hitMs = Date.now() - t2

  console.log(
    JSON.stringify(
      {
        missMs,
        hitMs,
        firstCount: first.length,
        secondCount: second.length,
        countsMatch: first.length === second.length,
      },
      null,
      2
    )
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
