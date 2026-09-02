import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bucketsFor, clientIp, consumeQuota } from './rate-limit';

vi.mock('./db', () => ({
  db: vi.fn(() => ({
    rpc: vi.fn(),
  })),
}));

describe('bucketsFor', () => {
  beforeEach(() => {
    process.env.RATE_LIMIT_ANON_PER_DEVICE = '3';
    process.env.RATE_LIMIT_ANON_PER_IP = '9';
    process.env.RATE_LIMIT_USER_PER_DAY = '15';
    process.env.RATE_LIMIT_USER_IP_PER_DAY = '40';
  });

  it('returns user + ip buckets for authenticated identity', () => {
    const result = bucketsFor({ userId: 'u-123', ip: '1.2.3.4', deviceId: null });
    expect(result.keys).toHaveLength(2);
    expect(result.keys[0]).toBe('user:u-123');
    expect(result.keys[1]).toMatch(/^ip:/);
    expect(result.limitsList).toEqual([15, 40]);
    expect(result.scopes).toEqual(['user', 'ip']);
  });

  it('returns device + ip buckets for anonymous identity', () => {
    const result = bucketsFor({ deviceId: 'd-abc', ip: '1.2.3.4', userId: null });
    expect(result.keys).toHaveLength(2);
    expect(result.keys[0]).toBe('device:d-abc');
    expect(result.keys[1]).toMatch(/^ip:/);
    expect(result.limitsList).toEqual([3, 9]);
    expect(result.scopes).toEqual(['device', 'ip']);
  });

  it('returns only device bucket when no IP (localhost)', () => {
    const result = bucketsFor({ deviceId: 'd-abc', ip: null, userId: null });
    expect(result.keys).toEqual(['device:d-abc']);
    expect(result.limitsList).toEqual([3]);
    expect(result.scopes).toEqual(['device']);
  });

  it('respects env overrides', () => {
    process.env.RATE_LIMIT_ANON_PER_DEVICE = '5';
    const result = bucketsFor({ deviceId: 'd-abc', ip: null, userId: null });
    expect(result.limitsList).toEqual([5]);
  });
});

describe('clientIp', () => {
  it('parses x-forwarded-for with multiple IPs', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    });
    expect(clientIp(request)).toBe('1.2.3.4');
  });

  it('falls back to x-real-ip', () => {
    const request = new Request('http://localhost', {
      headers: { 'x-real-ip': '10.0.0.1' },
    });
    expect(clientIp(request)).toBe('10.0.0.1');
  });

  it('returns null when neither header is present', () => {
    const request = new Request('http://localhost');
    expect(clientIp(request)).toBeNull();
  });
});

describe('consumeQuota', () => {
  beforeEach(() => {
    delete process.env.RATE_LIMIT_DISABLED;
    delete process.env.MOVESCAN_DEMO_MODE;
    delete process.env.RATE_LIMIT_ANON_PER_DEVICE;
    delete process.env.RATE_LIMIT_ANON_PER_IP;
    delete process.env.RATE_LIMIT_USER_PER_DAY;
    delete process.env.RATE_LIMIT_USER_IP_PER_DAY;
  });

  it('returns ok without calling db when RATE_LIMIT_DISABLED=1', async () => {
    process.env.RATE_LIMIT_DISABLED = '1';
    const result = await consumeQuota({ deviceId: 'd-abc', ip: '1.2.3.4', userId: null });
    expect(result).toEqual({ ok: true, blockedScope: null, authenticated: false });
  });

  it('returns ok without calling db when MOVESCAN_DEMO_MODE=1', async () => {
    process.env.MOVESCAN_DEMO_MODE = '1';
    const result = await consumeQuota({ deviceId: 'd-abc', ip: '1.2.3.4', userId: null });
    expect(result).toEqual({ ok: true, blockedScope: null, authenticated: false });
  });

  it('maps RPC return of blocked key to ok: false', async () => {
    const { db } = await import('./db');
    const mockRpc = vi.fn().mockResolvedValue({ data: 'device:x', error: null });
    vi.mocked(db).mockReturnValue({ rpc: mockRpc } as never);

    const result = await consumeQuota({ deviceId: 'x', ip: '1.2.3.4', userId: null });
    expect(result.ok).toBe(false);
    expect(result.blockedScope).toBe('device');
  });

  it('returns ok: true on RPC error (fail-open)', async () => {
    const { db } = await import('./db');
    const mockRpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'fail' } });
    vi.mocked(db).mockReturnValue({ rpc: mockRpc } as never);

    const result = await consumeQuota({ deviceId: 'x', ip: '1.2.3.4', userId: null });
    expect(result.ok).toBe(true);
  });
});
