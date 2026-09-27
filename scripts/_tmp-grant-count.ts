import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
const raw=readFileSync('.env.local','utf8')
for (const l of raw.split('\n')) { const m=l.match(/^([^#=]+)=(.*)$/); if(m) process.env[m[1].trim()]=m[2].trim() }
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!)
const { data } = await s.from('err_projects').select('grant_grid_id, grant_id, grant_serial_id').in('status',['active','approved','completed'])
const gridIds=new Set<string>(); const keys=new Set<string>()
for (const p of data||[]) {
  if (p.grant_grid_id) gridIds.add(String(p.grant_grid_id))
  if (p.grant_serial_id) keys.add(String(p.grant_serial_id).trim())
  if (p.grant_id) keys.add(String(p.grant_id).trim())
}
console.log(JSON.stringify({ projects: data?.length, uniqueGridIds: gridIds.size, uniqueGrantKeys: keys.size, gridBatches: Math.ceil(gridIds.size/80), keyBatches: Math.ceil(keys.size/80) }, null, 2))
