import { describe, it, expect } from 'vitest';
import { minutesSince, formatWait, urgencyOf } from './relative-time';

const NOW = Date.parse('2026-09-02T12:00:00Z');

describe('minutesSince', () => {
  it('measures elapsed whole minutes', () => {
    expect(minutesSince('2026-09-02T11:00:00Z', NOW)).toBe(60);
  });

  it('returns 0 for a missing timestamp rather than NaN', () => {
    expect(minutesSince(undefined, NOW)).toBe(0);
  });

  it('returns 0 for an unparseable timestamp', () => {
    expect(minutesSince('not a date', NOW)).toBe(0);
  });

  it('never returns a negative value for a future timestamp', () => {
    expect(minutesSince('2026-09-02T13:00:00Z', NOW)).toBe(0);
  });
});

describe('formatWait', () => {
  it('says "just now" under a minute', () => {
    expect(formatWait(0)).toBe('just now');
  });

  it('shows bare minutes under an hour', () => {
    expect(formatWait(42)).toBe('42m');
  });

  it('shows hours and minutes', () => {
    expect(formatWait(200)).toBe('3h 20m');
  });

  it('omits minutes on a whole hour', () => {
    expect(formatWait(120)).toBe('2h');
  });

  it('switches to days past 24 hours', () => {
    expect(formatWait(60 * 52)).toBe('2d 4h');
  });

  it('omits hours on a whole day', () => {
    expect(formatWait(60 * 48)).toBe('2d');
  });
});

describe('urgencyOf', () => {
  it('is fresh within the first hour', () => {
    expect(urgencyOf(59)).toBe('fresh');
  });

  it('becomes waiting at one hour', () => {
    expect(urgencyOf(60)).toBe('waiting');
  });

  it('becomes overdue at four hours', () => {
    expect(urgencyOf(240)).toBe('overdue');
  });

  it('stays overdue for very old quotes', () => {
    expect(urgencyOf(10_000)).toBe('overdue');
  });
});
