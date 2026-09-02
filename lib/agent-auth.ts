import {
  renewAgentSession,
  verifyAgentSession,
  type AgentSession,
} from './agent-session';

export const AGENT_SESSION_COOKIE = 'agent_session';
export const RETIRED_AGENT_COOKIE = 'agent_secret';

export const agentSessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

function cookieValue(request: Request, name: string): string | undefined {
  const cookie = request.headers.get('cookie');
  if (!cookie) return undefined;
  for (const part of cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function agentSecret(): string | null {
  return process.env.AGENT_CONSOLE_SECRET ?? null;
}

export async function getAgentSession(request: Request): Promise<AgentSession | null> {
  const secret = agentSecret();
  if (!secret) return null;
  return verifyAgentSession(cookieValue(request, AGENT_SESSION_COOKIE), secret);
}

export async function isAgentAuthenticated(request: Request): Promise<boolean> {
  return Boolean(await getAgentSession(request));
}

export async function renewAgentSessionForRequest(request: Request): Promise<string | null> {
  const secret = agentSecret();
  if (!secret) return null;
  return renewAgentSession(cookieValue(request, AGENT_SESSION_COOKIE), secret);
}
