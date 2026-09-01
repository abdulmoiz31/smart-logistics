import { describe, expect, it } from 'vitest';
import {
  CATEGORY_IDS,
  getEntry,
  resolveCubicFeet,
  suggestForRoom,
} from './catalogue';

describe('resolveCubicFeet', () => {
  it('returns the exact value for a known category and size', () => {
    expect(resolveCubicFeet('sofa_3seat', 'm')).toBe(50);
  });

  it('falls back to unknown_item for an unrecognised category', () => {
    expect(resolveCubicFeet('flux_capacitor', 'm')).toBe(15);
  });

  it('returns positive monotonic size values for every category', () => {
    for (const category of CATEGORY_IDS) {
      const small = resolveCubicFeet(category, 's');
      const medium = resolveCubicFeet(category, 'm');
      const large = resolveCubicFeet(category, 'l');
      expect(small).toBeGreaterThan(0);
      expect(medium).toBeGreaterThanOrEqual(small);
      expect(large).toBeGreaterThanOrEqual(medium);
    }
  });
});

describe('catalogue helpers', () => {
  it('returns the catch-all for an unknown category', () => {
    expect(getEntry('nope').category).toBe('unknown_item');
  });

  it('prioritises room-relevant entries and always includes the catch-all', () => {
    const entries = suggestForRoom('bedroom');
    expect(entries.map((entry) => entry.category)).toContain('mattress');
    expect(entries.map((entry) => entry.category)).toContain('unknown_item');
  });
});
