import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendComplianceCommittedDigest } from '@/lib/complianceDigest'

/**
 * GET /api/compliance/digest
 * Daily cron: consolidated email of F1s committed / FSP-assigned before Clear.
 * Auth: Vercel Cron (`x-vercel-cron`) or Bearer CRON_SECRET / Authorization header.
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get('authorization') || ''
    const cronSecret = process.env.CRON_SECRET
    const isVercelCron = request.headers.get('x-vercel-cron') === '1'
    const bearerOk =
      Boolean(cronSecret) &&
      (authHeader === `Bearer ${cronSecret}` || authHeader === cronSecret)

    if (!isVercelCron && !bearerOk) {
      // Allow unauthenticated only in development for manual testing
      if (process.env.NODE_ENV === 'production') {
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
