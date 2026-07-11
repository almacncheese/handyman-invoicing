import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * UX gate only — cookie presence is NOT authz.
 * Every API/handler still uses requireSession + assertSameBusiness.
 */
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/quotes',
  '/customers',
  '/invoices',
  '/catalog',
  '/settings',
  '/admin',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const needsAuth = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!needsAuth) return NextResponse.next();

  const session = request.cookies.get('hq_session')?.value;
  if (!session) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname);
    return NextResponse.redirect(login);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/quotes/:path*',
    '/customers/:path*',
    '/invoices/:path*',
    '/catalog/:path*',
    '/settings/:path*',
    '/admin/:path*',
  ],
};
