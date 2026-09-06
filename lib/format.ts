import type { Room } from './types';

export function formatLabel(value: string): string {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

/** 1-based position of a room within its session's room list (0 if not found). */
export function roomNumber(rooms: Array<Pick<Room, 'id'>>, roomId: string): number {
  return rooms.findIndex((room) => room.id === roomId) + 1;
}

/** "Room 2", or "Room 2 · Kitchen" once the customer has picked a room type. */
export function roomTitle(rooms: Room[], room: Room): string {
  const position = roomNumber(rooms, room.id);
  const base = position > 0 ? `Room ${position}` : 'Room';
  return room.roomType === 'other' ? base : `${base} · ${formatLabel(room.roomType)}`;
}
