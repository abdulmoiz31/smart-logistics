import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { createSession } from '@/lib/db';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';
import { getUser } from '@/lib/supabase/server';

export async function POST() {
  try {
    const cookieStore = await cookies();
    const device = resolveDeviceId(cookieStore.get(DEVICE_COOKIE)?.value);
    const user = await getUser();

    const sessionId = await createSession({
      userId: user?.id ?? null,
      deviceId: device.id,
    });

    const response = NextResponse.json({ sessionId }, { status: 201 });
    // The session records this device id, so the browser must end up holding the
    // same value — otherwise the user is locked out of the scan they just started.
    if (device.mint) response.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
    return response;
  } catch (error) {
    console.error('POST /api/session failed', error);
    return NextResponse.json({ error: 'Unable to create a scan session.' }, { status: 500 });
  }
}
