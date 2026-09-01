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

  return <form onSubmit={signIn} className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"><p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">MoveScan</p><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Agent console</h1><p className="mt-2 text-sm text-slate-600">Demo-grade shared access for moving specialists.</p><label className="mt-6 block text-sm font-bold text-slate-800">Shared password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-300 px-3" autoFocus /></label>{error && <p role="alert" className="mt-3 text-sm font-semibold text-rose-700">{error}</p>}<button disabled={loading} className="mt-5 min-h-11 w-full rounded-xl bg-cyan-700 font-bold text-white disabled:opacity-60">{loading ? 'Signing in…' : 'Open console'}</button></form>;
}

export default function AgentLoginPage() {
  return <main className="grid min-h-screen place-items-center bg-slate-950 p-5"><Suspense><LoginForm /></Suspense></main>;
}
