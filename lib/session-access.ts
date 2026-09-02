import 'server-only';

import { cookies } from 'next/headers';
import { DEVICE_COOKIE } from './device';
import { getUser } from './supabase/server';
import type { SessionOwner } from './types';

export interface Caller {
  userId: string | null;
  deviceId: string | null;
}

export class AccessDeniedError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const present = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.length > 0;

/**
 * Pure ownership predicate.
 *
 * An account-owned session is account-only. An anonymous session belongs to the
 * device that created it — and stays accessible from that device even after the
 * user signs in, so nobody loses a scan in the window before it is claimed.
 *
 * Sessions predating the ownership migration have neither owner and stay open:
 * estimate links already sent to customers, and every seeded demo row, must keep
 * working. That is a deliberate, temporary widening — it can be tightened once
 * pre-migration rows have aged out.
 */
export function canAccessSession(owner: SessionOwner | null, caller: Caller): boolean {
  if (!owner) return false;
  if (present(owner.userId)) return caller.userId === owner.userId;
  if (present(owner.deviceId)) {
    return present(caller.deviceId) && caller.deviceId === owner.deviceId;
  }
  return true;
}

/**
 * Resolve who is asking.
 *
 * Deliberately does NOT mint a device id. `resolveDeviceId` invents a fresh UUID
 * when the cookie is absent, and using that here would both compare an invented
 * id against stored ones and set a cookie during a read. Read paths resolve
 * identity; they never create it.
 */
export async function resolveCaller(): Promise<Caller> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(DEVICE_COOKIE)?.value;
  const deviceId = raw && UUID_RE.test(raw) ? raw : null;

  let userId: string | null = null;
  try {
    const user = await getUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  return { userId, deviceId };
}

/**
 * Throws when the caller may not touch this session, and equally when the
 * session does not exist. Collapsing both cases is what lets every route
 * answer 404 — a 403 would confirm the id is real.
 */
export async function assertSessionAccess(owner: SessionOwner | null): Promise<void> {
  const caller = await resolveCaller();
  if (!canAccessSession(owner, caller)) {
    throw new AccessDeniedError('Not found');
  }
}

/** True when the caller is the owning account, not merely the owning device. */
export async function callerOwnsAccount(owner: SessionOwner | null): Promise<boolean> {
  if (!owner || !present(owner.userId)) return false;
  const caller = await resolveCaller();
  return caller.userId === owner.userId;
}
