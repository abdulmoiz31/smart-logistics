import { describe, it, expect } from 'vitest';
import { canAccessSession } from './session-access';

const USER = 'user-1';
const DEVICE = 'device-1';

describe('canAccessSession', () => {
  it('allows the owning account', () => {
    expect(canAccessSession({ userId: USER, deviceId: DEVICE }, { userId: USER, deviceId: null })).toBe(true);
  });

  it('denies a different account even from the owning device', () => {
    expect(canAccessSession({ userId: USER, deviceId: DEVICE }, { userId: 'user-2', deviceId: DEVICE })).toBe(false);
  });

  it('denies an anonymous caller when the session belongs to an account', () => {
    expect(canAccessSession({ userId: USER, deviceId: DEVICE }, { userId: null, deviceId: DEVICE })).toBe(false);
  });

  it('allows the owning device for an anonymous session', () => {
    expect(canAccessSession({ userId: null, deviceId: DEVICE }, { userId: null, deviceId: DEVICE })).toBe(true);
  });

  it('allows the owning device even when the caller has since signed in', () => {
    // A user who scanned anonymously then signed in must not lose access before
    // the claim in Task 8 runs.
    expect(canAccessSession({ userId: null, deviceId: DEVICE }, { userId: USER, deviceId: DEVICE })).toBe(true);
  });

  it('denies a different device for an anonymous session', () => {
    expect(canAccessSession({ userId: null, deviceId: DEVICE }, { userId: null, deviceId: 'device-2' })).toBe(false);
  });

  it('allows unowned legacy rows', () => {
    expect(canAccessSession({ userId: null, deviceId: null }, { userId: null, deviceId: 'anything' })).toBe(true);
  });

  it('denies a caller with no identity at all against an owned session', () => {
    expect(canAccessSession({ userId: null, deviceId: DEVICE }, { userId: null, deviceId: null })).toBe(false);
  });

  it('does not treat an empty-string identity as a match', () => {
    expect(canAccessSession({ userId: null, deviceId: '' }, { userId: null, deviceId: '' })).toBe(true);
    expect(canAccessSession({ userId: '', deviceId: DEVICE }, { userId: '', deviceId: null })).toBe(false);
  });

  it('denies when the session owner is missing entirely', () => {
    expect(canAccessSession(null, { userId: USER, deviceId: DEVICE })).toBe(false);
  });
});
