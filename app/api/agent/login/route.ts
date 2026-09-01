import { NextResponse } from 'next/server';

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
    response.cookies.set('agent_secret', expectedSecret, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 8,
    });
    return response;
  } catch {
    return NextResponse.json({ error: 'Unable to sign in.' }, { status: 400 });
  }
}
