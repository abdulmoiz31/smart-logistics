import { getUser } from '@/lib/supabase/server';
import Link from 'next/link';

export async function AuthBadge() {
  const user = await getUser();

  if (!user) {
    return (
      <div className="fixed right-4 top-4 z-50 flex items-center gap-2">
        <Link
          href="/login"
          className="grid min-h-9 place-items-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="grid min-h-9 place-items-center rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white shadow-sm transition hover:bg-cyan-800"
        >
          Sign up
        </Link>
      </div>
    );
  }

  return (
    <div className="fixed right-4 top-4 z-50 flex items-center gap-3">
      <span className="text-sm text-slate-600">{user.email}</span>
      <form action="/api/auth/logout" method="POST">
        <button type="submit" className="text-sm font-semibold text-slate-700 hover:text-cyan-700">
          Sign out
        </button>
      </form>
    </div>
  );
}
