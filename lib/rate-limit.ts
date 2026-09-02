import 'server-only';

import { createHash } from 'node:crypto';
import { db } from './db';

export interface Identity {
  deviceId: string | null;
  ip: string | null;
  userId: string | null;
}

export interface QuotaResult {
  ok: boolean;
  blockedScope: 'device' | 'ip' | 'user' | null;
  authenticated: boolean;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function limits() {
  return {
    anonDevice: positiveInt(process.env.RATE_LIMIT_ANON_PER_DEVICE, 3),
    anonIp: positiveInt(process.env.RATE_LIMIT_ANON_PER_IP, 9),
    userDay: positiveInt(process.env.RATE_LIMIT_USER_PER_DAY, 15),
    userIp: positiveInt(process.env.RATE_LIMIT_USER_IP_PER_DAY, 40),
  };
}

export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0]!.trim() || null;
  return request.headers.get('x-real-ip');
}

function hashIp(ip: string): string {
  const salt = process.env.RATE_LIMIT_IP_SALT ?? 'movescan';
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

export function bucketsFor(identity: Identity): {
  keys: string[];
  limitsList: number[];
  scopes: Array<'device' | 'ip' | 'user'>;
} {
  const L = limits();
  const keys: string[] = [];
  const limitsList: number[] = [];
  const scopes: Array<'device' | 'ip' | 'user'> = [];

  if (identity.userId) {
    keys.push(`user:${identity.userId}`);
    limitsList.push(L.userDay);
    scopes.push('user');
    if (identity.ip) {
      keys.push(`ip:${hashIp(identity.ip)}`);
      limitsList.push(L.userIp);
      scopes.push('ip');
    }
  } else {
    if (identity.deviceId) {
      keys.push(`device:${identity.deviceId}`);
      limitsList.push(L.anonDevice);
      scopes.push('device');
    }
    if (identity.ip) {
      keys.push(`ip:${hashIp(identity.ip)}`);
      limitsList.push(L.anonIp);
      scopes.push('ip');
    }
  }
  return { keys, limitsList, scopes };
}

export async function consumeQuota(identity: Identity): Promise<QuotaResult> {
  const authenticated = Boolean(identity.userId);

  if (process.env.RATE_LIMIT_DISABLED === '1' || process.env.MOVESCAN_DEMO_MODE === '1') {
    return { ok: true, blockedScope: null, authenticated };
  }

  const { keys, limitsList, scopes } = bucketsFor(identity);
  if (!keys.length) return { ok: true, blockedScope: null, authenticated };

  try {
    const { data, error } = await db().rpc('consume_quota', {
      p_keys: keys,
      p_limits: limitsList,
    });
    if (error) {
      console.error('[rate-limit] consume_quota rpc failed', error);
      return { ok: true, blockedScope: null, authenticated };
    }
    if (typeof data === 'string' && data) {
      const index = keys.indexOf(data);
      return {
        ok: false,
        blockedScope: index >= 0 ? scopes[index] : 'ip',
        authenticated,
      };
    }
    return { ok: true, blockedScope: null, authenticated };
  } catch (cause) {
    console.error('[rate-limit] consume_quota threw', cause);
    return { ok: true, blockedScope: null, authenticated };
  }
}
