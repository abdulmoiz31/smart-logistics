import 'server-only';

import { redirect } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { getUser } from './supabase/server';

/** Server-component guard: returns the signed-in user or redirects to login. */
export async function requireUser(nextPath: string): Promise<User> {
  const user = await getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}
