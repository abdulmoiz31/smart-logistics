import Link from 'next/link';

export default function NotFound() {
  return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><section className="max-w-md text-center"><p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">MoveScan</p><h1 className="mt-3 text-3xl font-black text-slate-950">That page is not here.</h1><p className="mt-3 text-slate-600">The link may be incomplete, or the scan no longer exists.</p><Link href="/" className="mt-6 inline-grid min-h-11 place-items-center rounded-xl bg-cyan-700 px-4 font-bold text-white">Start a new scan</Link></section></main>;
}
