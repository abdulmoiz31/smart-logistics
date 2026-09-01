import 'server-only';

import { cookies } from 'next/headers';

export async function isAgentAuthenticated(): Promise<boolean> {
  const expectedSecret = process.env.AGENT_CONSOLE_SECRET;
  if (!expectedSecret) return false;
  const cookieStore = await cookies();
  return cookieStore.get('agent_secret')?.value === expectedSecret;
}
