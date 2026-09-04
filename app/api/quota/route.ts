import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { DEVICE_COOKIE } from '@/lib/device';
import { clientIp, peekQuota } from '@/lib/rate-limit';
import { getUser } from '@/lib/supabase/server';

export async function GET(request: Request) {
  try {
    const cookieStore = await cookies();
    const deviceId = cookieStore.get(DEVICE_COOKIE)?.value ?? null;
    const user = await getUser();

    const status = await peekQuota({
      deviceId,
      ip: clientIp(request),
      userId: user?.id ?? null,
    });
    return NextResponse.json(status);
  } catch (error) {
    console.error('GET /api/quota failed', error);
    return NextResponse.json({ remaining: null, limit: null, authenticated: false, unlimited: true });
  }
}
