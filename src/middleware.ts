import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const isAuthenticated = req.cookies.get('isAuthenticated')
  const userType = req.cookies.get('userType')
  const path = req.nextUrl.pathname

  // If trying to access root, redirect based on user type
  if (path === '/') {
    if (!isAuthenticated) {
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
    '/err-portal/:path*',
    '/partner-portal/:path*',
    '/forecast/:path*',
    '/dashboard/:path*',
    '/((?!api|_next/static|_next/image|favicon.ico|logo.jpg).*)',
  ],
} 