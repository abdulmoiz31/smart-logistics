import { createItem, getSessionOwnerForRoom} from '@/lib/db';
import { getEntry, resolveCubicFeet } from '@/lib/catalogue';
import type { SizeClass } from '@/lib/types';
import { isUuid } from '@/lib/validation';
import { assertSessionAccess } from '@/lib/session-access';

const sizeClasses: SizeClass[] = ['s', 'm', 'l'];

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isUuid(body.roomId) || typeof body.category !== 'string' || !sizeClasses.includes(body.sizeClass as SizeClass)) {
      return Response.json({ error: 'A valid roomId, category, and sizeClass are required.' }, { status: 400 });
    }
    try {
      // Authorize before doing any work: an unauthorized caller must not write
      // files or burn someone else's quota. 404 not 403 — see lib/session-access.ts.
      await assertSessionAccess(await getSessionOwnerForRoom(body.roomId));
    } catch {
      return Response.json({ error: 'Room not found.' }, { status: 404 });
    }
    const entry = getEntry(body.category);
    const item = await createItem(body.roomId, {
      name: entry.label,
      category: entry.category,
      count: 1,
      sizeClass: body.sizeClass as SizeClass,
      cubicFeet: resolveCubicFeet(entry.category, body.sizeClass as SizeClass),
      confidence: 1,
      source: 'user_added',
      editedByUser: true,
    });
    return Response.json({ item }, { status: 201 });
  } catch (error) {
    console.error('POST /api/item failed', error);
    return Response.json({ error: 'Unable to add this item.' }, { status: 500 });
  }
}
