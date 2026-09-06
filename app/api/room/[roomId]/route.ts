import { deleteEmptyRoom, setAccessFlags, updateRoomType, getSessionOwnerForRoom} from '@/lib/db';
import type { AccessFlag, RoomType } from '@/lib/types';
import { isUuid } from '@/lib/validation';
import { assertSessionAccess } from '@/lib/session-access';

const roomTypes: RoomType[] = [
  'living_room', 'bedroom', 'kitchen', 'dining_room', 'bathroom',
  'garage', 'basement', 'office', 'other',
];
const accessFlags: AccessFlag[] = ['stairs', 'elevator', 'long_carry'];

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    if (!isUuid(roomId)) return Response.json({ error: 'Invalid room ID.' }, { status: 400 });
    try {
      // Ownership failure and "does not exist" answer identically on purpose:
      // a 403 would confirm the id is real.
      await assertSessionAccess(await getSessionOwnerForRoom(roomId));
    } catch {
      return Response.json({ error: 'Room not found.' }, { status: 404 });
    }
    const body = await request.json() as Record<string, unknown>;
    if (body.roomType !== undefined) {
      if (!roomTypes.includes(body.roomType as RoomType)) {
        return Response.json({ error: 'Invalid room type.' }, { status: 400 });
      }
      await updateRoomType(roomId, body.roomType as RoomType);
    }
    if (body.accessFlags !== undefined) {
      if (!Array.isArray(body.accessFlags) || !body.accessFlags.every((flag) => accessFlags.includes(flag as AccessFlag))) {
        return Response.json({ error: 'Invalid access flags.' }, { status: 400 });
      }
      await setAccessFlags(roomId, body.accessFlags as AccessFlag[]);
    }
    return Response.json({ ok: true });
  } catch (error) {
    console.error('PATCH /api/room/[roomId] failed', error);
    return Response.json({ error: 'Unable to update this room.' }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> },
) {
  try {
    const { roomId } = await params;
    if (!isUuid(roomId)) return Response.json({ error: 'Invalid room ID.' }, { status: 400 });
    try {
      await assertSessionAccess(await getSessionOwnerForRoom(roomId));
    } catch {
      return Response.json({ error: 'Room not found.' }, { status: 404 });
    }
    // Only removes a room with no items and no photos; a room with real content
    // is left untouched and { deleted: false } is returned.
    const deleted = await deleteEmptyRoom(roomId);
    return Response.json({ deleted });
  } catch (error) {
    console.error('DELETE /api/room/[roomId] failed', error);
    return Response.json({ error: 'Unable to remove this room.' }, { status: 500 });
  }
}
