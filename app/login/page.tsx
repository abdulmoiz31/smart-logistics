'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      {open ? (
        <>
          <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
          <circle cx="12" cy="12" r="3" />
        </>
      ) : (
        <>
          <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
          <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
          <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
          <line x1="2" x2="22" y1="2" y2="22" />
        </>
      )}
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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
      <p className="mt-2 text-sm text-slate-600">Welcome back</p>
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
        <span className="relative mt-2 block">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="min-h-11 w-full rounded-xl border border-slate-300 px-3 pr-10"
            autoComplete="current-password"
            required
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-700"
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            <EyeIcon open={showPassword} />
          </button>
        </span>
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
