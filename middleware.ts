import { NextResponse, type NextRequest } from 'next/server';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';
import { refreshSession } from '@/lib/supabase/middleware';

const AGENT_PREFIX = '/agent';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const { id, mint } = resolveDeviceId(request.cookies.get(DEVICE_COOKIE)?.value);
  if (mint) response.cookies.set(DEVICE_COOKIE, id, deviceCookieOptions);

  await refreshSession(request, response);

  const { pathname } = request.nextUrl;
  if (pathname.startsWith(AGENT_PREFIX) && pathname !== '/agent/login') {
    const expectedSecret = process.env.AGENT_CONSOLE_SECRET;
    if (!expectedSecret || request.cookies.get('agent_secret')?.value !== expectedSecret) {
      const loginUrl = new URL('/agent/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/',
    '/scan/:path*',
    '/review/:path*',
    '/estimate/:path*',
    '/signup',
    '/login',
    '/agent/:path*',
  ],
};
