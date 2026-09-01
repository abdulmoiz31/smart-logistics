import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === '/agent/login') return NextResponse.next();
  const expectedSecret = process.env.AGENT_CONSOLE_SECRET;
  if (expectedSecret && request.cookies.get('agent_secret')?.value === expectedSecret) {
    return NextResponse.next();
  }
  const loginUrl = new URL('/agent/login', request.url);
  loginUrl.searchParams.set('next', request.nextUrl.pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = { matcher: ['/agent/:path*'] };
