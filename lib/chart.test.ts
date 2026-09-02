import { describe, it, expect } from 'vitest';
import { niceTicks, linearScale, linePath, stackLayout, bucketByDay } from './chart';

describe('niceTicks', () => {
  it('returns round numbers spanning the data', () => {
    const ticks = niceTicks(0, 87, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(87);
    expect(ticks.every((t) => Number.isInteger(t))).toBe(true);
  });

  it('never returns a single tick for a flat series', () => {
    expect(niceTicks(5, 5, 4).length).toBeGreaterThanOrEqual(2);
  });

  it('handles an all-zero series without NaN', () => {
    const ticks = niceTicks(0, 0, 4);
    expect(ticks.some(Number.isNaN)).toBe(false);
    expect(ticks[ticks.length - 1]).toBeGreaterThan(0);
  });
});

describe('linearScale', () => {
  it('maps domain start to range start', () => {
    expect(linearScale(0, 100, 0, 200)(0)).toBe(0);
  });

  it('maps domain end to range end', () => {
    expect(linearScale(0, 100, 0, 200)(100)).toBe(200);
  });

  it('returns the range midpoint for a zero-width domain rather than dividing by zero', () => {
    const scale = linearScale(7, 7, 0, 200);
    expect(Number.isNaN(scale(7))).toBe(false);
    expect(scale(7)).toBe(100);
  });
});

describe('linePath', () => {
  it('produces one move and n-1 line commands', () => {
    const d = linePath([[0, 0], [10, 5], [20, 2]]);
    expect(d.startsWith('M')).toBe(true);
    expect((d.match(/L/g) ?? []).length).toBe(2);
  });

  it('returns an empty string for no points, so SVG renders nothing', () => {
    expect(linePath([])).toBe('');
  });

  it('returns a lone move for a single point', () => {
    expect(linePath([[3, 4]])).toBe('M 3 4');
  });
});

describe('stackLayout', () => {
  it('converts values to cumulative percentage offsets', () => {
    const out = stackLayout([25, 25, 50]);
    expect(out.map((s) => Math.round(s.percent))).toEqual([25, 25, 50]);
    expect(Math.round(out[2].offset)).toBe(50);
  });

  it('returns an empty array for an all-zero input rather than NaN offsets', () => {
    expect(stackLayout([0, 0])).toEqual([]);
  });

  it('percentages sum to 100', () => {
    const total = stackLayout([3, 7, 11]).reduce((s, x) => s + x.percent, 0);
    expect(Math.round(total)).toBe(100);
  });
});

describe('bucketByDay', () => {
  it('counts timestamps into their UTC day', () => {
    const out = bucketByDay(
      ['2026-09-01T10:00:00Z', '2026-09-01T22:00:00Z', '2026-09-02T01:00:00Z'],
      ['2026-09-01', '2026-09-02'],
    );
    expect(out).toEqual({ '2026-09-01': 2, '2026-09-02': 1 });
  });

  it('returns zero for days with no activity, so the line has no gaps', () => {
    const out = bucketByDay([], ['2026-09-01', '2026-09-02']);
    expect(out).toEqual({ '2026-09-01': 0, '2026-09-02': 0 });
  });

  it('ignores timestamps outside the requested days', () => {
    const out = bucketByDay(['2025-01-01T00:00:00Z'], ['2026-09-01']);
    expect(out).toEqual({ '2026-09-01': 0 });
  });
});
