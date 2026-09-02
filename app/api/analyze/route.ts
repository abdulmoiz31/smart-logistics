import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { resolveRoomType } from './room-type';
import { getCaptureBase64, replaceItems, saveCapture, updateRoomType, getSessionOwnerForRoom} from '@/lib/db';
import { analyzeRoom } from '@/lib/gemini';
import { resolveCubicFeet } from '@/lib/catalogue';
import { consumeQuota, clientIp } from '@/lib/rate-limit';
import { getUser } from '@/lib/supabase/server';
import { DEVICE_COOKIE, resolveDeviceId, deviceCookieOptions } from '@/lib/device';
import type { RoomType } from '@/lib/types';
import { isUuid } from '@/lib/validation';
import { assertSessionAccess } from '@/lib/session-access';

const roomTypes: RoomType[] = [
  'living_room', 'bedroom', 'kitchen', 'dining_room', 'bathroom',
  'garage', 'basement', 'office', 'other',
];

export async function POST(request: Request) {
  try {
    if (!request.headers.get('content-type')?.startsWith('multipart/form-data')) {
      return NextResponse.json({ error: 'Upload room images as multipart form data.' }, { status: 400 });
    }
    const formData = await request.formData();
    const roomId = formData.get('roomId');
    const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
    const roomTypeValue = formData.get('roomType');
    const hint = roomTypes.includes(roomTypeValue as RoomType) ? roomTypeValue as RoomType : undefined;

    if (!isUuid(roomId)) {
      return NextResponse.json({ error: 'A valid roomId is required.' }, { status: 400 });
    }
    if (!files.length) return NextResponse.json({ error: 'At least one image is required.' }, { status: 400 });
    if (files.length > 12) return NextResponse.json({ error: 'Upload no more than 12 images.' }, { status: 400 });
    if (files.some((file) => !file.type.startsWith('image/') || file.size > 1 * 1024 * 1024)) {
      return NextResponse.json({ error: 'Each upload must be an image no larger than 1 MB.' }, { status: 400 });
    }

    try {
      // Authorize before doing any work: an unauthorized caller must not write
      // files or burn someone else's quota. 404 not 403 — see lib/session-access.ts.
      await assertSessionAccess(await getSessionOwnerForRoom(roomId));
    } catch {
      return Response.json({ error: 'Room not found.' }, { status: 404 });
    }
    const cookieStore = await cookies();
    const device = resolveDeviceId(cookieStore.get(DEVICE_COOKIE)?.value);
    const user = await getUser();

    const quota = await consumeQuota({
      deviceId: device.id,
      ip: clientIp(request),
      userId: user?.id ?? null,
    });

    if (!quota.ok) {
      const message = quota.authenticated
        ? "You've reached today's limit of 15 scans. It resets tomorrow."
        : "You've used your 3 free scans for today. Create a free account for 15 scans a day.";
      const res = NextResponse.json(
        { error: message, code: 'quota_exceeded', scope: quota.blockedScope, authenticated: quota.authenticated },
        { status: 429 },
      );
      if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
      return res;
    }

    await Promise.all(files.map(async (file) => {
      await saveCapture(roomId, Buffer.from(await file.arrayBuffer()), file.type);
    }));
    const images = await getCaptureBase64(roomId);
    const result = await analyzeRoom(images, hint);
    const items = await replaceItems(roomId, result.analysis.items.map((item) => ({
      ...item,
      cubicFeet: resolveCubicFeet(item.category, item.sizeClass),
      source: 'ai' as const,
      editedByUser: false,
    })));
    const finalRoomType = resolveRoomType(hint, result.analysis.roomType);
    await updateRoomType(roomId, finalRoomType);
    const res = NextResponse.json({ items, roomType: finalRoomType, demoMode: result.demoMode, degraded: result.degraded });
    if (device.mint) res.cookies.set(DEVICE_COOKIE, device.id, deviceCookieOptions);
    return res;
  } catch (error) {
    console.error('POST /api/analyze failed', error);
    return NextResponse.json({ error: 'Unable to analyse this room. Please try again.' }, { status: 500 });
  }
}
