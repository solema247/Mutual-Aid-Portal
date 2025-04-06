import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()

  // Check for authentication status in cookies
  const isAuthenticated = req.cookies.get('isAuthenticated')
  
  console.log('Is authenticated:', isAuthenticated)

  // If not authenticated and trying to access protected route, redirect to login
  if (!isAuthenticated && 
      !req.nextUrl.pathname.startsWith('/login') && 
      !req.nextUrl.pathname.startsWith('/api/auth')) {
    console.log('Redirecting to login - not authenticated')
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return res
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