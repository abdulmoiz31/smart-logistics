'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to sign in.');
      const next = searchParams.get('next');
      const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      router.replace(safeNext);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to sign in.');
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">MoveScan</p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Sign in</h1>
      <p className="mt-2 text-sm text-slate-600">Welcome back. 15 scans a day.</p>
      <label className="mt-6 block text-sm font-bold text-slate-800">
        Email
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3"
          autoComplete="email"
          autoFocus
          required
        />
      </label>
      <label className="mt-4 block text-sm font-bold text-slate-800">
        Password
        <input
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3"
          autoComplete="current-password"
          required
        />
      </label>
      {error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}
      <button disabled={loading} className="mt-5 min-h-11 w-full rounded-xl bg-cyan-700 font-bold text-white disabled:opacity-60">
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="mt-4 text-center text-sm text-slate-600">
        Need an account?{' '}
        <Link href={`/signup${searchParams.get('next') ? `?next=${encodeURIComponent(searchParams.get('next')!)}` : ''}`} className="font-bold text-cyan-700">
          Sign up
        </Link>
      </p>
      <p className="mt-3 text-center text-sm">
        <Link href={(() => { const n = searchParams.get('next'); return n && n.startsWith('/') && !n.startsWith('//') ? n : '/'; })()} className="text-slate-500 underline hover:text-slate-700">
          Go back
        </Link>
      </p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 p-5">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
