'use client';

import Link from 'next/link';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body className="grid min-h-screen place-items-center bg-u-bg p-6"><main className="max-w-md text-center"><p className="text-sm font-bold uppercase tracking-[0.16em] text-c-accent">MoveScan</p><h1 className="mt-3 text-3xl font-black text-u-ink">Something got in the way.</h1><p className="mt-3 text-u-ink-2">Your scan is still saved. Try again, or return to the start.</p><div className="mt-6 flex justify-center gap-3"><button type="button" onClick={reset} className="min-h-11 rounded-xl bg-c-accent px-4 font-bold text-c-accent-ink">Try again</button><Link href="/" className="grid min-h-11 place-items-center rounded-xl border border-u-border px-4 font-bold text-u-ink-2">Start page</Link></div></main></body></html>;
}
