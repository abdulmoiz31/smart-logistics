import type { User } from '@supabase/supabase-js';
import Link from 'next/link';
import { UserMenu } from './UserMenu';

export function AuthBadge({ user }: { user: User | null }) {
  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="grid min-h-9 place-items-center rounded-xl border border-u-border bg-u-panel px-4 text-sm font-bold text-u-ink-2 shadow-sm transition hover:border-c-accent hover:text-c-accent"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="grid min-h-9 place-items-center rounded-xl bg-c-accent px-4 text-sm font-bold text-c-accent-ink shadow-sm transition hover:opacity-90"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return <UserMenu email={user.email ?? 'Signed in'} />;
}
