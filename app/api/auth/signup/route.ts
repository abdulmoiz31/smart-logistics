import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { claimDeviceSessions } from '@/lib/db';
import { DEVICE_COOKIE } from '@/lib/device';
import { supabaseServer } from '@/lib/supabase/server';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!emailPattern.test(email)) {
      return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Use a password of at least 8 characters.' }, { status: 400 });
    }
    const supabase = await supabaseServer();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      const alreadyRegistered = /already registered/i.test(error.message);
      return NextResponse.json(
        { error: alreadyRegistered ? 'That email is already registered. Sign in instead.' : 'Unable to create your account.' },
        { status: alreadyRegistered ? 409 : 400 },
      );
    }
    await claimScansForDevice(data.user?.id);

    return NextResponse.json({ ok: true });
  } catch (cause) {
    console.error('POST /api/auth/signup failed', cause);
    return NextResponse.json({ error: 'Unable to create your account.' }, { status: 400 });
  }
}

/**
 * Attach any unowned scans from this device to the account that just authenticated.
 * A failure here must never fail the sign-in — the user is authenticated either way,
 * and losing a claim is recoverable while losing the session is not.
 */
async function claimScansForDevice(userId: string | undefined): Promise<void> {
  if (!userId) return;
  try {
    const cookieStore = await cookies();
    const deviceId = cookieStore.get(DEVICE_COOKIE)?.value;
    if (!deviceId) return;
    const claimed = await claimDeviceSessions(deviceId, userId);
    if (claimed > 0) console.info(`[auth] claimed ${claimed} scan(s) for user ${userId}`);
  } catch (cause) {
    console.error('[auth] claiming device scans failed', cause);
  }
}
