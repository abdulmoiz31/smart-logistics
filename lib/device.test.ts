import { describe, expect, it } from 'vitest';
import { resolveDeviceId } from './device';

describe('resolveDeviceId', () => {
  it('mints a new UUID when no existing value', () => {
    const result = resolveDeviceId(undefined);
    expect(result.mint).toBe(true);
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });

  it('returns the same id when a valid UUID is provided', () => {
    const uuid = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const result = resolveDeviceId(uuid);
    expect(result.mint).toBe(false);
    expect(result.id).toBe(uuid);
  });

  it('mints a new UUID for garbage input', () => {
    const result = resolveDeviceId('garbage');
    expect(result.mint).toBe(true);
    expect(result.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  });
});
