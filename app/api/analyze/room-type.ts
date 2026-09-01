import type { RoomType } from '@/lib/types';

/**
 * The user's explicit selection always wins. Model inference only fills a gap.
 * A user who picks "Living room" and sees "Other" reads it as the app ignoring them.
 */
export function resolveRoomType(hint: RoomType | undefined, inferred: RoomType): RoomType {
  if (hint) return hint;
  return inferred;
}
