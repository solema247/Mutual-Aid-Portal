import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession()

  // Always allow login page
  if (req.nextUrl.pathname === '/login') {
    // If already authenticated, redirect to home
    if (session) {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return res
  }

  // Require authentication for all other pages
  if (!session) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/',
    '/forecast/:path*',
    '/dashboard/:path*',
    '/((?!_next/static|_next/image|favicon.ico|public|login|api/auth).*)',
  ],
} 