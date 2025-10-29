import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })
  
  // Check if this is a magic link sign in
  const requestUrl = new URL(req.url)
  const token = requestUrl.searchParams.get('token')
  const type = requestUrl.searchParams.get('type')
  
  // Handle magic link authentication
  if (token && type === 'magiclink') {
    const { data: { session }, error } = await supabase.auth.verifyOtp({
      token_hash: token,
      type: 'magiclink'
    })
    
    if (session && !error) {
      return NextResponse.redirect(new URL('/change-password', req.url))
    }
  }

  const { data: { session } } = await supabase.auth.getSession()
  const isAuthenticated = req.cookies.get('isAuthenticated')
  const userType = req.cookies.get('userType')
  const path = req.nextUrl.pathname

  // If trying to access root, redirect based on user type
  if (path === '/') {
    if (!session && !isAuthenticated) {
      return NextResponse.redirect(new URL('/login', req.url))
    }
    if (userType?.value === 'err') {
      return NextResponse.redirect(new URL('/err-portal', req.url))
    }
    if (userType?.value === 'partner') {
      return NextResponse.redirect(new URL('/partner-portal', req.url))
    }
  }

  // Allow login and change-password pages access
  if (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/change-password') {
    // Only redirect away from login if we have BOTH session AND cookies
    // This prevents redirect loop after logout when cookies are cleared but session might still exist briefly
    if (session && isAuthenticated && req.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return res
  }

  // Require authentication for all other pages
  if (!session && !isAuthenticated) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Role-based access control
  if (userType?.value === 'partner' && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', req.url))
  }
  if (userType?.value === 'err' && req.nextUrl.pathname.startsWith('/forecast')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return res
}

export const config = {
  matcher: [
    '/',
    '/err-portal/:path*',
    '/partner-portal/:path*',
    '/forecast/:path*',
    '/dashboard/:path*',
    '/change-password',
    '/((?!api|_next/static|_next/image|favicon.ico|logo.jpg).*)',
  ],
} 