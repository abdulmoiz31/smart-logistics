import { createRoom } from '@/lib/db';
import type { RoomType } from '@/lib/types';
import { isUuid } from '@/lib/validation';

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
