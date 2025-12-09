import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const requestUrl = new URL(req.url)
  const path = req.nextUrl.pathname
  
  // Early return for login, change-password, and create-test-user pages - skip session checks to avoid rate limits
  if (path === '/login' || path === '/change-password' || path === '/create-test-user') {
    // Only check session if we need to redirect authenticated users away from login
    // But do it safely with error handling
    try {
      const supabase = createMiddlewareClient({ req, res })
      
      // Check if this is a magic link sign in
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
      
      // Only check session if we have cookies indicating authentication
      // This prevents unnecessary token refresh attempts
      const isAuthenticated = req.cookies.get('isAuthenticated')
      if (isAuthenticated && path === '/login') {
        // Only call getSession if cookies suggest user is authenticated
        // This reduces unnecessary refresh attempts
        const { data: { session } } = await supabase.auth.getSession()
        if (session) {
          return NextResponse.redirect(new URL('/', req.url))
        }
      }
    } catch (error) {
      // If we get a 429 or any other error, just allow the request through
      // The login page will handle authentication
      console.error('Middleware auth check error (non-blocking):', error)
    }
    
    return res
  }

  // For all other pages, check authentication
  // But handle errors gracefully to avoid blocking on rate limits
  let session = null
  try {
    const supabase = createMiddlewareClient({ req, res })
    const { data: { session: sessionData } } = await supabase.auth.getSession()
    session = sessionData
  } catch (error) {
    // If we hit a rate limit or other error, fall back to cookie check
    // Don't block the request - let the page handle auth errors
    console.error('Middleware session check error (non-blocking):', error)
  }

  const isAuthenticated = req.cookies.get('isAuthenticated')
  const userType = req.cookies.get('userType')

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