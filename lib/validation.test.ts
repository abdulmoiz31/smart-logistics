import { describe, expect, it } from 'vitest';
import { isUuid } from './validation';

describe('isUuid', () => {
  it('accepts RFC 4122 UUID values', () => {
    expect(isUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
  });

  it('rejects malformed and non-string identifiers', () => {
    expect(isUuid('not-a-uuid')).toBe(false);
    expect(isUuid('550e8400-e29b-41d4-a716-44665544000')).toBe(false);
    expect(isUuid(42)).toBe(false);
  });
});
