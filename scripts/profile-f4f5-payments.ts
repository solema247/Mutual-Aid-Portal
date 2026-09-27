/**
 * Read-only: compare legacy loadProjectPaymentSummaries (MOU path) vs reporting payment path.
 * Usage: npx tsx scripts/profile-f4f5-payments.ts
 */
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { createClient } from '@supabase/supabase-js'
import { loadProjectPaymentSummaries } from '../src/lib/mouPaymentConfirmations'
import { loadReportingPaymentMaps } from '../src/lib/f4f5/paymentSummary'

function loadEnvLocal() {
  const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf8')
  for (const line of raw.split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/)
    if (!m) continue
    const key = m[1].trim()
    let val = m[2].trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = val
  }
}

async function legacyMaps(
  supabase: ReturnType<typeof createClient>,
  mouIds: string[],
  projectById: Map<string, Record<string, unknown>>
) {
  const transferDateByProject: Record<string, string> = {}
  const rateByProject: Record<string, number> = {}
  const summaries = await loadProjectPaymentSummaries(supabase, { mouIds })
  for (const [projectId, summary] of Object.entries(summaries)) {
    if (!projectById.has(projectId)) continue
    if (summary.transfer_date) transferDateByProject[projectId] = summary.transfer_date
    if (summary.exchange_rate != null) rateByProject[projectId] = summary.exchange_rate
  }
  const SUPABASE_IN_BATCH = 80
  for (let i = 0; i < mouIds.length; i += SUPABASE_IN_BATCH) {
    const batch = mouIds.slice(i, i + SUPABASE_IN_BATCH)
    const { data: mousRows } = await supabase.from('mous').select('id, exchange_rate').in('id', batch)
    for (const mou of mousRows || []) {
      const mouRate = (mou as { exchange_rate?: number }).exchange_rate
      if (typeof mouRate !== 'number' || mouRate <= 0) continue
      for (const [pid, project] of projectById) {
        if (String(project.mou_id) === String((mou as { id: string }).id) && rateByProject[pid] == null) {
          rateByProject[pid] = mouRate
        }
      }
    }
  }
  return { transferDateByProject, rateByProject }
}

function diffMaps(
  a: Record<string, string | number>,
  b: Record<string, string | number>,
  projectIds: string[]
) {
  let mismatches = 0
  for (const id of projectIds) {
    if (a[id] !== b[id]) mismatches++
  }
  return mismatches
}

async function bench(label: string, fn: () => Promise<void>) {
  const t0 = Date.now()
  await fn()
  const ms = Date.now() - t0
  console.log(`${label}: ${ms}ms`)
  return ms
}

async function main() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = process.env.SUPABASE_SERVICE_KEY!
  const supabase = createClient(url, key)

  const { data: projects } = await supabase
    .from('err_projects')
    .select('id, mou_id, date_transfer')
    .in('status', ['active', 'approved', 'completed'])

  const projectById = new Map<string, Record<string, unknown>>()
  const mouIds = new Set<string>()
  for (const p of projects || []) {
    projectById.set(String(p.id), p as Record<string, unknown>)
    if (p.mou_id) mouIds.add(String(p.mou_id))
  }
  const mouIdList = [...mouIds]
  const projectIds = [...projectById.keys()]
  console.log(`Admin-like scope: ${projectIds.length} projects, ${mouIdList.length} MOUs`)

  let legacyResult: Awaited<ReturnType<typeof legacyMaps>> | null = null
  const legacyMs = await bench('MOU/payment LEGACY (loadProjectPaymentSummaries + mous)', async () => {
    legacyResult = await legacyMaps(supabase, mouIdList, projectById)
  })

  let newResult: Awaited<ReturnType<typeof loadReportingPaymentMaps>> | null = null
  const newMs = await bench('MOU/payment NEW (loadReportingPaymentMaps)', async () => {
    newResult = await loadReportingPaymentMaps(supabase, mouIdList, projectById)
  })

  if (legacyResult && newResult) {
    const td = diffMaps(legacyResult.transferDateByProject, newResult.transferDateByProject, projectIds)
    const rt = diffMaps(legacyResult.rateByProject, newResult.rateByProject, projectIds)
    console.log(`transfer_date mismatches (scoped projects): ${td}`)
    console.log(`exchange_rate mismatches (scoped projects): ${rt}`)
    console.log(`speedup MOU phase: ${((legacyMs / newMs) * 100 - 100).toFixed(1)}% faster`)
  }

  const one = projectIds.slice(0, 1)
  const oneMap = new Map(one.map((id) => [id, projectById.get(id)!]))
  const oneMou = oneMap.get(one[0])?.mou_id ? [String(oneMap.get(one[0])!.mou_id)] : []
  console.log('\nSingle-project sample:')
  await bench('MOU/payment LEGACY (1 project)', () =>
    legacyMaps(supabase, oneMou, oneMap).then(() => undefined)
  )
  await bench('MOU/payment NEW (1 project)', () =>
    loadReportingPaymentMaps(supabase, oneMou, oneMap).then(() => undefined)
  )
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
