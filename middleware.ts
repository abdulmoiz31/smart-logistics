import { NextResponse, type NextRequest } from 'next/server';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';
import { refreshSession } from '@/lib/supabase/middleware';
import {
  AGENT_SESSION_COOKIE,
  agentSessionCookieOptions,
  renewAgentSessionForRequest,
} from '@/lib/agent-auth';

const AGENT_PREFIX = '/agent';

export async function middleware(request: NextRequest) {
  const response = NextResponse.next();

  const { id, mint } = resolveDeviceId(request.cookies.get(DEVICE_COOKIE)?.value);
  if (mint) response.cookies.set(DEVICE_COOKIE, id, deviceCookieOptions);

  await refreshSession(request, response);

  const { pathname } = request.nextUrl;
  response.headers.set('x-pathname', pathname);

  if (pathname.startsWith(AGENT_PREFIX) && pathname !== '/agent/login') {
    // Verify the signed session token, not the raw secret. The token carries its own
    // idle window and absolute deadline, so expiry is enforced server-side rather
    // than trusting the client to honour a cookie maxAge.
    const renewed = await renewAgentSessionForRequest(request);
    if (!renewed) {
      const loginUrl = new URL('/agent/login', request.url);
      loginUrl.searchParams.set('next', pathname);
      const redirect = NextResponse.redirect(loginUrl);
      // Clear a stale or tampered token so the browser stops replaying it.
      redirect.cookies.set(AGENT_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
      return redirect;
    }
    // Sliding idle window: refresh lastSeen on every authorized request while
    // renewAgentSession preserves the original absoluteExpiry.
    response.cookies.set(AGENT_SESSION_COOKIE, renewed, agentSessionCookieOptions);
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
