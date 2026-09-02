import { NextResponse } from 'next/server';
import {
  AGENT_SESSION_COOKIE,
  RETIRED_AGENT_COOKIE,
  agentSessionCookieOptions,
} from '@/lib/agent-auth';
import { createAgentSession } from '@/lib/agent-session';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const expectedSecret = process.env.AGENT_CONSOLE_SECRET;
    if (!expectedSecret) {
      console.error('AGENT_CONSOLE_SECRET is not set');
      return NextResponse.json(
        { error: 'Agent console is not configured. Set AGENT_CONSOLE_SECRET.' },
        { status: 503 },
      );
    }
    if (typeof body.password !== 'string' || body.password !== expectedSecret) {
      return NextResponse.json({ error: 'Incorrect password.' }, { status: 401 });
    }
    const response = NextResponse.json({ ok: true });
    response.cookies.set(AGENT_SESSION_COOKIE, await createAgentSession(expectedSecret), agentSessionCookieOptions);
    response.cookies.set(RETIRED_AGENT_COOKIE, '', { path: '/', maxAge: 0 });
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to sign in.' }, { status: 400 });
  }
}
