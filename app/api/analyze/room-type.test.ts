import { describe, it, expect } from 'vitest';
import { resolveRoomType } from './room-type';

describe('resolveRoomType', () => {
  it('keeps the user hint when the model is unsure', () => {
    expect(resolveRoomType('living_room', 'other')).toBe('living_room');
  });

  it('accepts a confident model inference when the user gave no hint', () => {
    expect(resolveRoomType(undefined, 'bedroom')).toBe('bedroom');
  });

  it('prefers the user hint over a conflicting model answer', () => {
    expect(resolveRoomType('office', 'bedroom')).toBe('office');
  });

  it('falls back to other when neither is available', () => {
    expect(resolveRoomType(undefined, 'other')).toBe('other');
  });
});
