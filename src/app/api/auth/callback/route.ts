import { NextResponse } from 'next/server'
import { createSbRouteClient } from '@/lib/sbRoute'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createSbRouteClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Redirect to change-password page after sign in process completes
  return NextResponse.redirect(`${requestUrl.origin}/change-password`)
} 