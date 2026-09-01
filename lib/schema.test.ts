import { describe, expect, it } from 'vitest';
import livingRoom from './fixtures/living_room.json';
import { parseRefinement, parseRoomAnalysis, SchemaError } from './schema';

describe('parseRoomAnalysis', () => {
  it('accepts the checked-in fixture', () => {
    const analysis = parseRoomAnalysis(livingRoom);
    expect(analysis.roomType).toBe('living_room');
    expect(analysis.items).toHaveLength(livingRoom.items.length);
  });

  it('forgives category, room, count, size, and confidence values', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'dungeon',
      items: [{
        name: 'odd thing',
        category: 'not-real',
        count: 0,
        sizeClass: 'huge',
        confidence: 4,
      }],
    });
    expect(analysis).toEqual({
      roomType: 'other',
      items: [{
        name: 'odd thing',
        category: 'unknown_item',
        count: 1,
        sizeClass: 'm',
        confidence: 1,
      }],
    });
  });

  it('drops malformed individual items but rejects malformed envelopes', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'bedroom',
      items: [
        { name: 'good', category: 'mattress', count: 1, sizeClass: 'm', confidence: 0.9 },
        { category: 'dresser' },
      ],
    });
    expect(analysis.items).toHaveLength(1);
    expect(() => parseRoomAnalysis({ roomType: 'bedroom', items: 'items' })).toThrow(SchemaError);
    expect(() => parseRoomAnalysis(null)).toThrow(SchemaError);
  });
});

describe('parseRefinement', () => {
  it('sanitizes a refinement response', () => {
    expect(parseRefinement({ category: 'mattress', sizeClass: 'l', confidence: 0.8 }))
      .toEqual({ category: 'mattress', sizeClass: 'l', confidence: 0.8 });
  });

  it('rejects malformed refinement envelopes', () => {
    expect(() => parseRefinement({ category: 'mattress' })).toThrow(SchemaError);
  });
});
