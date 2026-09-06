import Link from 'next/link';
import { getUser } from '@/lib/supabase/server';
import { AuthBadge } from './AuthBadge';
import { ThemeToggle } from './ThemeToggle';

function actionFor(pathname: string) {
  const [, route, sessionId] = pathname.split('/');
  //routes 
  if (pathname === '/') {
    return <span className="hidden rounded-full bg-u-panel px-3 py-1 text-xs font-bold text-u-ink-2 shadow-sm sm:inline-flex">Moving estimates, made simple</span>;
  }
  if (route === 'scan') return <span className="text-sm font-semibold text-u-ink-3">Room-by-room scan</span>;
  if (route === 'review' && sessionId) return <Link href={`/scan/${sessionId}`} className="text-sm font-bold text-c-accent">Add another room</Link>;
  if (route === 'estimate' && sessionId) return <Link href={`/review/${sessionId}`} className="text-sm font-bold text-c-accent">Edit inventory</Link>;
  return null;
}

export async function AppHeader({ pathname }: { pathname: string }) {
  const user = await getUser();
  const action = actionFor(pathname);

  return (
    <header className="bg-u-bg px-4 py-4 sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2">
        <Link href="/" className="text-xl font-black tracking-tight text-u-ink">
          Move<span className="text-c-accent">Scan</span>
        </Link>
        {action && <div className="order-3 basis-full sm:order-none sm:basis-auto">{action}</div>}
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle variant="customer" />
          <AuthBadge user={user} />
        </div>
      </div>
    </header>
  );
}
