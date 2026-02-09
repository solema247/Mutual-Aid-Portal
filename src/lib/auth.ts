import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  // Check if this is a magic link sign in
  const requestUrl = new URL(req.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    // This is a magic link signin
    return NextResponse.redirect(new URL('/change-password', req.url))
  }

  // Refresh session if expired
  const { data: { session } } = await supabase.auth.getSession()

  // Allow login and change-password pages
  if (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/change-password') {
    // If already authenticated and on login, redirect to home
    if (session && req.nextUrl.pathname === '/login') {
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
    '/change-password',
    '/((?!_next/static|_next/image|favicon.ico|public|login|api/auth).*)',
  ],
} 