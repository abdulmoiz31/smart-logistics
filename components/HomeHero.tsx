'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export function HomeHero({ authenticated }: { authenticated: boolean }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');

  async function startScan() {
    setStarting(true);
    setError('');
    try {
      const response = await fetch('/api/session', { method: 'POST' });
      const data = await response.json() as { sessionId?: string; error?: string };
      if (!response.ok || !data.sessionId) throw new Error(data.error ?? 'Unable to start your scan.');
      router.push(`/scan/${data.sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to start your scan.');
      setStarting(false);
    }
  }

  return (
    <main className="min-h-screen bg-u-bg px-5 py-10 sm:px-8">
      <div className="mx-auto flex min-h-[calc(100vh-5rem)] max-w-5xl flex-col justify-between">
        <section className="grid items-center gap-10 py-16 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-c-accent">Your home, in your own time</p>
            <h1 className="mt-4 max-w-xl text-5xl font-black tracking-[-0.055em] text-u-ink sm:text-6xl">Get a moving estimate from your phone.</h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-u-ink-2">Take a few photos of each room. We&apos;ll build your inventory, explain uncertainty, and give you a clear estimate range.</p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={startScan}
                disabled={starting}
                className="min-h-12 rounded-2xl bg-c-accent px-6 text-base font-bold text-c-accent-ink shadow-lg shadow-c-accent/20 transition hover:opacity-90 disabled:cursor-wait disabled:opacity-70"
              >
                {starting ? 'Starting your scan…' : 'Start your free scan'}
              </button>
              {!authenticated && (
                <Link
                  href="/signup"
                  className="grid min-h-12 place-items-center rounded-2xl border-2 border-c-accent bg-u-panel px-6 text-base font-bold text-c-accent transition hover:bg-c-accent/10"
                >
                  Sign up
                </Link>
              )}
            </div>
            {error && <p role="alert" className="mt-3 text-sm font-medium text-c-overdue">{error}</p>}
            <p className="mt-4 text-sm text-u-ink-3">No credit card. Just photos.</p>
          </div>
          <div className="rounded-[2rem] border border-u-border bg-u-panel p-6 shadow-xl shadow-u-ink/5 sm:p-8">
            <p className="text-sm font-bold uppercase tracking-[0.16em] text-c-accent">How it works</p>
            <ol className="mt-6 space-y-5">
              {[
                ['1', 'Photograph each room', 'Use the phone camera you already have.'],
                ['2', 'Check your inventory', 'Correct anything with quick taps.'],
                ['3', 'Get your estimate', 'A moving specialist confirms it within 2 hours.'],
              ].map(([number, title, detail]) => (
                <li key={number} className="flex gap-4">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-c-accent font-mono text-sm font-black text-c-accent-ink">{number}</span>
                  <span><strong className="block text-u-ink">{title}</strong><span className="text-sm text-u-ink-2">{detail}</span></span>
                </li>
              ))}
            </ol>
          </div>
        </section>
        <p className="text-sm text-u-ink-3">Estimates are based on your photos and confirmed by a moving specialist.</p>
      </div>
    </main>
  );
}
