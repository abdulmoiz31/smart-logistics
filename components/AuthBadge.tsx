import { getUser } from '@/lib/supabase/server';
import Link from 'next/link';

export async function AuthBadge() {
  const user = await getUser();

  if (!user) {
    return (
      <div className="fixed right-4 top-4 z-50">
        <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-cyan-700">
          Sign in
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
