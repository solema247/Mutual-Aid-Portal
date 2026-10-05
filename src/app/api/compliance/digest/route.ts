import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendComplianceCommittedDigest } from '@/lib/complianceDigest'

/**
 * GET /api/compliance/digest
 * Daily cron: one Slack message listing F1s committed / FSP-assigned before Clear.
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` when CRON_SECRET is set.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const cronSecret = process.env.CRON_SECRET

    if (process.env.NODE_ENV === 'production') {
      if (!cronSecret) {
        console.error('[compliance-digest] CRON_SECRET is not set; Vercel Cron cannot authenticate')
        return NextResponse.json({ error: 'CRON_SECRET not configured' }, { status: 500 })
      }
      if (authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      }
    }

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) {
      return NextResponse.json(
        { error: 'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' },
        { status: 500 }
      )
    }

    const supabase = createClient(url, key)
    const result = await sendComplianceCommittedDigest(supabase)
    return NextResponse.json({
      success: true,
      ...result,
      channel: 'slack'
    })
  } catch (error) {
    console.error('Compliance digest error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Digest failed' },
      { status: 500 }
    )
  }
}
