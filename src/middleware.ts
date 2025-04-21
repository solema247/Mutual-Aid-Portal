import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  // Check for authentication cookie
  const isAuthenticated = req.cookies.get('isAuthenticated')
  const userType = req.cookies.get('userType')

  // Allow login and change-password pages access
  if (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/change-password') {
    if (isAuthenticated && req.nextUrl.pathname === '/login') {
      return NextResponse.redirect(new URL('/', req.url))
    }
    return NextResponse.next()
  }

  // Require authentication for all other pages
  if (!isAuthenticated) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  // Role-based access control
  if (userType?.value === 'partner' && req.nextUrl.pathname.startsWith('/dashboard')) {
    return NextResponse.redirect(new URL('/', req.url))
  }
  if (userType?.value === 'err' && req.nextUrl.pathname.startsWith('/forecast')) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/forecast/:path*',
    '/dashboard/:path*',
    // Add other protected routes here
    // Exclude auth-related paths
    '/((?!_next/static|_next/image|favicon.ico|public|login|api/auth).*)',
  ],
} 