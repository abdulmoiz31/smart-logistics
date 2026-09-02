import { NextResponse } from 'next/server';
import { AGENT_SESSION_COOKIE, RETIRED_AGENT_COOKIE } from '@/lib/agent-auth';

/**
 * Ends the agent console session.
 *
 * POST rather than GET: a GET would let any page trigger a sign-out with an
 * <img> tag. Clears the retired `agent_secret` cookie too, so a browser that
 * still holds one from before the token migration is fully cleaned up.
 */
export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(AGENT_SESSION_COOKIE, '', { path: '/', maxAge: 0 });
  response.cookies.set(RETIRED_AGENT_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
