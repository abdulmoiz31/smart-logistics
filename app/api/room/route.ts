import { createRoom, getSessionOwner} from '@/lib/db';
import type { RoomType } from '@/lib/types';
import { isUuid } from '@/lib/validation';
import { assertSessionAccess } from '@/lib/session-access';

const roomTypes: RoomType[] = [
  'living_room', 'bedroom', 'kitchen', 'dining_room', 'bathroom',
  'garage', 'basement', 'office', 'other',
];

export async function POST(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    if (!isUuid(body.sessionId)) {
      return Response.json({ error: 'A valid sessionId is required.' }, { status: 400 });
    }
    try {
      // Authorize before doing any work: an unauthorized caller must not write
      // files or burn someone else's quota. 404 not 403 — see lib/session-access.ts.
      await assertSessionAccess(await getSessionOwner(body.sessionId));
    } catch {
      return Response.json({ error: 'Session not found.' }, { status: 404 });
    }
    const roomType = roomTypes.includes(body.roomType as RoomType)
      ? body.roomType as RoomType
      : 'other';
    const roomId = await createRoom(body.sessionId, roomType);
    return Response.json({ roomId, roomType }, { status: 201 });
  } catch (error) {
    console.error('POST /api/room failed', error);
    return Response.json({ error: 'Unable to create a room.' }, { status: 500 });
  }
}
