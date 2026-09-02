import type { User } from '@supabase/supabase-js';
import Link from 'next/link';

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

  return (
    <div className="flex items-center gap-3">
      <span className="max-w-36 truncate text-sm text-u-ink-3">{user.email}</span>
      <form action="/api/auth/logout" method="POST">
        <button type="submit" className="min-h-9 text-sm font-semibold text-u-ink-2 hover:text-c-accent">
          Sign out
        </button>
      </form>
    </div>
  );
}
