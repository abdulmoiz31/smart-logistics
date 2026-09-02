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

  it('preserves a valid uncertaintyReason', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'mystery item', category: 'unknown_item', count: 1, sizeClass: 'm', confidence: 0.4, uncertaintyReason: 'partly hidden' }],
    });
    expect(analysis.items[0].uncertaintyReason).toBe('partly hidden');
  });

  it('drops a non-string uncertaintyReason', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'thing', category: 'armchair', count: 1, sizeClass: 'm', confidence: 0.5, uncertaintyReason: 42 }],
    });
    expect(analysis.items[0].uncertaintyReason).toBeUndefined();
  });

  it('drops an empty-string uncertaintyReason', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'thing', category: 'armchair', count: 1, sizeClass: 'm', confidence: 0.5, uncertaintyReason: '   ' }],
    });
    expect(analysis.items[0].uncertaintyReason).toBeUndefined();
  });

  it('preserves uncertaintyReason from the fixture', () => {
    const analysis = parseRoomAnalysis(livingRoom);
    const chair = analysis.items.find((i) => i.category === 'armchair');
    expect(chair?.uncertaintyReason).toBe('partly hidden behind the sofa');
  });

  it('preserves valid seenInImages indices', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, seenInImages: [1, 3] }],
    }, 5);
    expect(analysis.items[0].seenInImages).toEqual([1, 3]);
  });

  it('drops out-of-range seenInImages indices', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, seenInImages: [0, 99] }],
    }, 5);
    expect(analysis.items[0].seenInImages).toBeUndefined();
  });

  it('drops non-integer seenInImages values', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, seenInImages: ['two', 1.5] }],
    }, 5);
    expect(analysis.items[0].seenInImages).toBeUndefined();
  });

  it('preserves a valid box', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, box: { image: 2, x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }],
    }, 5);
    expect(analysis.items[0].box).toEqual({ image: 2, x: 0.1, y: 0.2, w: 0.3, h: 0.4 });
  });

  it('drops a box with an out-of-range image index', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, box: { image: 6, x: 0.1, y: 0.2, w: 0.3, h: 0.4 } }],
    }, 5);
    expect(analysis.items[0].box).toBeUndefined();
  });

  it('drops a box with negative coordinates', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, box: { image: 1, x: -0.1, y: 0.2, w: 0.3, h: 0.4 } }],
    }, 5);
    expect(analysis.items[0].box).toBeUndefined();
  });

  it('drops a box that extends past the image edge', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, box: { image: 1, x: 0.8, y: 0.2, w: 0.3, h: 0.4 } }],
    }, 5);
    expect(analysis.items[0].box).toBeUndefined();
  });

  it('drops a sub-2% box', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, box: { image: 1, x: 0.1, y: 0.2, w: 0.01, h: 0.4 } }],
    }, 5);
    expect(analysis.items[0].box).toBeUndefined();
  });

  it('drops a non-object box', () => {
    const analysis = parseRoomAnalysis({
      roomType: 'living_room',
      items: [{ name: 'sofa', category: 'sofa_3seat', count: 1, sizeClass: 'm', confidence: 0.9, box: 'whole image' }],
    }, 5);
    expect(analysis.items[0].box).toBeUndefined();
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
