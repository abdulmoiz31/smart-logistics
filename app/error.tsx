'use client';

import Link from 'next/link';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <html lang="en"><body className="grid min-h-screen place-items-center bg-slate-50 p-6"><main className="max-w-md text-center"><p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">MoveScan</p><h1 className="mt-3 text-3xl font-black text-slate-950">Something got in the way.</h1><p className="mt-3 text-slate-600">Your scan is still saved. Try again, or return to the start.</p><div className="mt-6 flex justify-center gap-3"><button type="button" onClick={reset} className="min-h-11 rounded-xl bg-cyan-700 px-4 font-bold text-white">Try again</button><Link href="/" className="grid min-h-11 place-items-center rounded-xl border border-slate-300 px-4 font-bold text-slate-700">Start page</Link></div></main></body></html>;
}
