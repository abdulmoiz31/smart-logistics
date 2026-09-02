import { describe, expect, it } from 'vitest';
import {
  AGENT_SESSION_ABSOLUTE_MS,
  AGENT_SESSION_IDLE_MS,
  createAgentSession,
  renewAgentSession,
  verifyAgentSession,
} from './agent-session';

const SECRET = 'agent-console-test-secret';
const OTHER_SECRET = 'different-agent-console-secret';
const NOW = 1_700_000_000_000;

describe('agent sessions', () => {
  it('creates and verifies an HMAC-signed session', async () => {
    const token = await createAgentSession(SECRET, NOW);

    await expect(verifyAgentSession(token, SECRET, NOW)).resolves.toEqual({
      issuedAt: NOW,
      lastSeen: NOW,
      absoluteExpiry: NOW + AGENT_SESSION_ABSOLUTE_MS,
    });
  });

  it('rejects malformed, tampered, and wrong-secret tokens without throwing', async () => {
    const token = await createAgentSession(SECRET, NOW);
    const [payload, signature] = token.split('.');
    const tampered = `${payload}.${signature!.slice(0, -1)}${signature!.endsWith('a') ? 'b' : 'a'}`;

    await expect(verifyAgentSession('not-a-token', SECRET, NOW)).resolves.toBeNull();
    await expect(verifyAgentSession(tampered, SECRET, NOW)).resolves.toBeNull();
    await expect(verifyAgentSession(token, OTHER_SECRET, NOW)).resolves.toBeNull();
  });

  it('rejects sessions idle for more than 30 minutes', async () => {
    const token = await createAgentSession(SECRET, NOW);

    await expect(verifyAgentSession(token, SECRET, NOW + AGENT_SESSION_IDLE_MS + 1)).resolves.toBeNull();
  });

  it('rejects sessions after their absolute eight-hour expiry', async () => {
    let token = await createAgentSession(SECRET, NOW);
    for (let elapsed = AGENT_SESSION_IDLE_MS - 1; elapsed < AGENT_SESSION_ABSOLUTE_MS; elapsed += AGENT_SESSION_IDLE_MS - 1) {
      token = await renewAgentSession(token, SECRET, NOW + elapsed) ?? '';
    }

    await expect(verifyAgentSession(token, SECRET, NOW + AGENT_SESSION_ABSOLUTE_MS)).resolves.toBeNull();
  });

  it('renews idle activity without extending the absolute expiry', async () => {
    const token = await createAgentSession(SECRET, NOW);
    const renewed = await renewAgentSession(token, SECRET, NOW + 10_000);

    expect(renewed).not.toBeNull();
    await expect(verifyAgentSession(renewed ?? undefined, SECRET, NOW + 10_000)).resolves.toEqual({
      issuedAt: NOW,
      lastSeen: NOW + 10_000,
      absoluteExpiry: NOW + AGENT_SESSION_ABSOLUTE_MS,
    });
  });
});
