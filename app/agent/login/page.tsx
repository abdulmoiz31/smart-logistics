'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function signIn(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/agent/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to sign in.');
      const requestedPath = searchParams.get('next') ?? '/agent';
      router.replace(requestedPath.startsWith('/agent') && !requestedPath.startsWith('//') ? requestedPath : '/agent');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={signIn} className="w-full max-w-sm rounded-2xl border border-c-border bg-c-panel p-7 shadow-2xl">
      <p className="font-mono text-[11px] font-bold uppercase tracking-[0.22em] text-c-accent">Meridian Dispatch</p>
      <h1 className="mt-3 text-2xl font-bold tracking-tight text-c-ink">Sign in to the console</h1>
      <p className="mt-2 text-sm text-c-ink-2">Shared access for moving specialists.</p>

      <label className="mt-7 block font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-c-ink-2">
        Shared password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-lg border border-c-border bg-c-panel-2 px-3 font-mono text-base text-c-ink placeholder:text-c-ink-3 focus:border-c-accent focus:outline-none"
          autoFocus
        />
      </label>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-c-overdue/30 bg-c-overdue/10 p-2.5 text-sm font-semibold text-c-overdue">
          {error}
        </p>
      )}

      <button
        disabled={loading}
        className="mt-6 min-h-11 w-full rounded-lg bg-c-accent font-bold text-c-accent-ink transition hover:bg-c-accent/90 disabled:opacity-60"
      >
        {loading ? 'Signing in…' : 'Open console'}
      </button>
    </form>
  );
}

export default function AgentLoginPage() {
  return <main className="grid min-h-dvh place-items-center bg-c-bg p-5"><Suspense><LoginForm /></Suspense></main>;
}
