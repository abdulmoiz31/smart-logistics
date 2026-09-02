import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getCaptureBase64, getItem, updateItem } from '@/lib/db';
import { refineItem } from '@/lib/gemini';
import { resolveCubicFeet } from '@/lib/catalogue';
import { consumeQuota, clientIp } from '@/lib/rate-limit';
import { getUser } from '@/lib/supabase/server';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';
import { isUuid } from '@/lib/validation';

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isUuid(body.itemId)) {
      return NextResponse.json({ error: 'A valid itemId is required.' }, { status: 400 });
    }
    const item = await getItem(body.itemId);
    if (!item) return NextResponse.json({ error: 'Item not found.' }, { status: 404 });
    if (item.confidence >= 0.7 && !item.ambiguousBetween?.length) {
      return NextResponse.json({ item, demoMode: false });
    }

    const cookieStore = await cookies();
    const device = resolveDeviceId(cookieStore.get(DEVICE_COOKIE)?.value);
    const user = await getUser();
    const quota = await consumeQuota({ deviceId: device.id, ip: clientIp(request), userId: user?.id ?? null });
    if (!quota.ok) {
      const message = quota.authenticated
        ? "You've reached today's limit of 15 checks. It resets tomorrow."
        : "You've used your 3 free AI checks for today. Create a free account for 15 a day.";
      const res = NextResponse.json(
        { error: message, code: 'quota_exceeded', scope: quota.blockedScope, authenticated: quota.authenticated },
        { status: 429 },
      );
      if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
      return res;
    }

    const candidates = item.ambiguousBetween?.length ? item.ambiguousBetween : [item.category];
    const refinement = await refineItem(
      await getCaptureBase64(item.roomId),
      item.name,
      candidates,
    );

    if (refinement.demoMode) {
      const res = NextResponse.json({ item, demoMode: true, degraded: refinement.degraded, refined: false });
      if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
      return res;
    }

    const allowed = new Set(candidates);
    const category = allowed.has(refinement.category) ? refinement.category : item.category;
    const updated = await updateItem(item.id, {
      category,
      sizeClass: refinement.sizeClass,
      confidence: refinement.confidence,
      cubicFeet: resolveCubicFeet(category, refinement.sizeClass),
      source: 'refined',
      ambiguousBetween: [],
    }, false);
    const res = NextResponse.json({ item: updated, demoMode: false, degraded: refinement.degraded, refined: true });
    if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
    return res;
  } catch (error) {
    console.error('POST /api/refine failed', error);
    return NextResponse.json({ error: 'Unable to refine this item.' }, { status: 500 });
  }
}
