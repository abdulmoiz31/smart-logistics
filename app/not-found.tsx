import Link from 'next/link';

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-u-bg p-6"><section className="max-w-md text-center"><p className="text-sm font-bold uppercase tracking-[0.16em] text-c-accent">MoveScan</p><h1 className="mt-3 text-3xl font-black text-u-ink">That page is not here.</h1><p className="mt-3 text-u-ink-2">The link may be incomplete, or the scan no longer exists.</p><Link href="/" className="mt-6 inline-grid min-h-11 place-items-center rounded-xl bg-c-accent px-4 font-bold text-c-accent-ink">Start a new scan</Link></section></main>;
}
