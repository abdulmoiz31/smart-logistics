export const AGENT_SESSION_IDLE_MS = 30 * 60 * 1_000;
export const AGENT_SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1_000;

export interface AgentSession {
  issuedAt: number;
  lastSeen: number;
  absoluteExpiry: number;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) return null;
  try {
    const padded = value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4);
    const binary = atob(padded);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function signature(input: string, secret: string): Promise<Uint8Array> {
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(input)));
}

function signaturesMatch(actual: Uint8Array, expected: Uint8Array): boolean {
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index]! ^ expected[index]!;
  }
  return difference === 0;
}

function isSession(value: unknown): value is AgentSession {
  if (!value || typeof value !== 'object') return false;
  const { issuedAt, lastSeen, absoluteExpiry } = value as Record<string, unknown>;
  // Narrow before comparing: Number.isSafeInteger does not narrow `unknown` for TS.
  if (typeof issuedAt !== 'number' || typeof lastSeen !== 'number' || typeof absoluteExpiry !== 'number') {
    return false;
  }
  return Number.isSafeInteger(issuedAt)
    && Number.isSafeInteger(lastSeen)
    && Number.isSafeInteger(absoluteExpiry)
    && issuedAt >= 0
    && issuedAt <= lastSeen
    && lastSeen <= absoluteExpiry;
}

async function signSession(session: AgentSession, secret: string): Promise<string> {
  const payload = toBase64Url(encoder.encode(JSON.stringify(session)));
  return `${payload}.${toBase64Url(await signature(payload, secret))}`;
}

export async function createAgentSession(secret: string, now = Date.now()): Promise<string> {
  return signSession({
    issuedAt: now,
    lastSeen: now,
    absoluteExpiry: now + AGENT_SESSION_ABSOLUTE_MS,
  }, secret);
}

export async function verifyAgentSession(token: string | undefined, secret: string, now = Date.now()): Promise<AgentSession | null> {
  try {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, encodedSignature] = parts;
    if (!payload || !encodedSignature) return null;

    const payloadBytes = fromBase64Url(payload);
    const actualSignature = fromBase64Url(encodedSignature);
    if (!payloadBytes || !actualSignature) return null;

    const parsed = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!isSession(parsed)) return null;

    const expectedSignature = await signature(payload, secret);
    if (!signaturesMatch(actualSignature, expectedSignature)) return null;
    if (now - parsed.lastSeen > AGENT_SESSION_IDLE_MS || now >= parsed.absoluteExpiry) return null;

    return parsed;
  } catch {
    return null;
  }
}

export async function renewAgentSession(token: string | undefined, secret: string, now = Date.now()): Promise<string | null> {
  const session = await verifyAgentSession(token, secret, now);
  if (!session) return null;
  return signSession({ ...session, lastSeen: now }, secret);
}
