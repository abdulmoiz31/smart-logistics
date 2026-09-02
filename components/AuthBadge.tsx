import { getUser } from '@/lib/supabase/server';
import Link from 'next/link';

export async function AuthBadge() {
  const user = await getUser();

  if (!user) {
    return (
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
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
    <div className="fixed right-4 top-4 z-50 flex items-center gap-3">
      <span className="text-sm text-u-ink-3">{user.email}</span>
      <form action="/api/auth/logout" method="POST">
        <button type="submit" className="text-sm font-semibold text-u-ink-2 hover:text-c-accent">
          Sign out
        </button>
      </form>
    </div>
  );
}
