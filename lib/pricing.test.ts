import { describe, expect, it } from 'vitest';
import {
  computeTolerance,
  formatCents,
  priceQuote,
  totalCubicFeet,
} from './pricing';
import type { Item, RateCard } from './types';

const card: RateCard = {
  companyName: 'Test Co.',
  perCubicFootCents: 100,
  cuftPerCrewHour: 100,
  crewHourlyCents: 10000,
  minimumCents: 0,
  accessAdderCents: { stairs: 7500, elevator: 5000, long_carry: 6000 },
};

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: 'item-1',
    roomId: 'room-1',
    name: 'Thing',
    category: 'sofa_3seat',
    count: 1,
    sizeClass: 'm',
    cubicFeet: 50,
    confidence: 0.9,
    source: 'ai',
    editedByUser: false,
    ...overrides,
  };
}

describe('totalCubicFeet', () => {
  it('multiplies per-unit volume by count exactly once', () => {
    expect(totalCubicFeet([item({ cubicFeet: 50, count: 3 })])).toBe(150);
  });

  it('returns zero for no items', () => {
    expect(totalCubicFeet([])).toBe(0);
  });
});

describe('computeTolerance', () => {
  it('uses the confidence floor for a confident inventory', () => {
    expect(computeTolerance([item(), item()])).toBe(0.08);
  });

  it('widens for uncertain and manually added items', () => {
    expect(computeTolerance([
      item({ confidence: 0.4 }),
      item({ source: 'user_added' }),
    ])).toBe(0.11);
  });

  it('caps a highly uncertain inventory', () => {
    const uncertain = Array.from({ length: 40 }, () => item({ confidence: 0.1 }));
    expect(computeTolerance(uncertain)).toBe(0.3);
  });
});

describe('priceQuote', () => {
  it('adds base, labor, and each unique access fee', () => {
    const quote = priceQuote([item({ cubicFeet: 100 })], ['stairs', 'stairs'], card);
    expect(quote).toMatchObject({
      totalCubicFeet: 100,
      baseCents: 10000,
      laborCents: 10000,
      accessCents: 7500,
      subtotalCents: 27500,
    });
  });

  it('rounds labor upward and applies a non-empty minimum', () => {
    const quote = priceQuote(
      [item({ cubicFeet: 101 })],
      [],
      { ...card, minimumCents: 99999 },
    );
    expect(quote.laborCents).toBe(20000);
    expect(quote.subtotalCents).toBe(99999);
  });

  it('returns integer monetary values and a bracketed range', () => {
    const quote = priceQuote([item({ cubicFeet: 37, count: 3 })], ['long_carry'], card);
    for (const value of [
      quote.baseCents,
      quote.laborCents,
      quote.accessCents,
      quote.subtotalCents,
      quote.lowCents,
      quote.highCents,
    ]) {
      expect(Number.isInteger(value)).toBe(true);
    }
    expect(quote.lowCents).toBeLessThan(quote.subtotalCents);
    expect(quote.highCents).toBeGreaterThan(quote.subtotalCents);
  });

  it('does not price an empty inventory at the moving minimum', () => {
    const quote = priceQuote([], [], { ...card, minimumCents: 99999 });
    expect(quote.subtotalCents).toBe(0);
    expect(Number.isNaN(quote.lowCents)).toBe(false);
  });
});

describe('formatCents', () => {
  it('formats rounded dollar amounts', () => {
    expect(formatCents(249500)).toBe('$2,495');
  });
});
