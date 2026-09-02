export const DEVICE_COOKIE = 'msid';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function resolveDeviceId(existing: string | undefined): { id: string; mint: boolean } {
  if (existing && UUID_RE.test(existing)) return { id: existing, mint: false };
  return { id: crypto.randomUUID(), mint: true };
}

export const deviceCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: 60 * 60 * 24 * 365,
};
