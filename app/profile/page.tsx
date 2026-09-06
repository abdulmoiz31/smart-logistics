import Link from 'next/link';
import { redirect } from 'next/navigation';
import { SignOutButton } from '@/components/SignOutButton';
import { getUser } from '@/lib/supabase/server';

export default async function ProfilePage() {
  const user = await getUser();
  if (!user) redirect('/login?next=/profile');

  const joined = user.created_at
    ? new Date(user.created_at).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <main className="min-h-screen bg-u-bg px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-lg">
        <h1 className="mt-2 text-3xl font-black tracking-tight text-u-ink">Your account</h1>
        <section className="mt-6 rounded-3xl border border-u-border bg-u-panel p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-c-accent text-xl font-black text-c-accent-ink">
              {(user.email ?? '?').trim().charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-bold text-u-ink">{user.email}</p>
              {joined && <p className="text-sm text-u-ink-3">Member since {joined}</p>}
            </div>
          </div>
          <div className="mt-6 rounded-xl border border-u-border bg-u-bg p-4 text-sm text-u-ink-2">
            Signed-in accounts get 15 AI scans a day, instead of the 3 given to anonymous visitors.
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href="/scans" className="grid min-h-11 place-items-center rounded-xl border border-u-border bg-u-bg px-4 text-sm font-bold text-u-ink transition hover:border-c-accent hover:text-c-accent">
              My scans
            </Link>
            <Link href="/requests" className="grid min-h-11 place-items-center rounded-xl border border-u-border bg-u-bg px-4 text-sm font-bold text-u-ink transition hover:border-c-accent hover:text-c-accent">
              My requests
            </Link>
          </div>
        </section>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row">
          <Link href="/" className="grid min-h-11 place-items-center rounded-xl bg-c-accent px-4 font-bold text-c-accent-ink transition hover:opacity-90">
            Start a new scan
          </Link>
          <SignOutButton className="grid min-h-11 place-items-center rounded-xl border border-u-border bg-u-panel px-4 font-bold text-u-ink-2 transition hover:border-c-accent hover:text-c-accent disabled:opacity-60" />
        </div>
      </div>
    </main>
  );
}
