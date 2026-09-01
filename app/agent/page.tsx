'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatCents } from '@/lib/pricing';
import type { QuoteSummary } from '@/lib/types';

export default function AgentQueuePage() {
  const [quotes, setQuotes] = useState<QuoteSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch('/api/agent/queue');
        const data = await response.json() as { quotes?: QuoteSummary[]; error?: string };
        if (!response.ok || !data.quotes) throw new Error(data.error ?? 'Unable to load the quote queue.');
        setQuotes(data.quotes);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load the quote queue.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, []);

  return <main className="min-h-screen bg-slate-100 px-5 py-8"><div className="mx-auto max-w-5xl"><header className="flex items-center justify-between"><div><p className="text-sm font-bold uppercase tracking-[0.16em] text-cyan-700">Meridian Moving Co.</p><h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">Agent quote queue</h1></div><Link href="/agent/leads" className="text-sm font-bold text-cyan-700">Lead dashboard</Link></header>{loading ? <p className="mt-10 text-slate-600">Loading pending quotes…</p> : error ? <p className="mt-10 font-semibold text-rose-700">{error}</p> : quotes.length === 0 ? <section className="mt-10 rounded-3xl bg-white p-8 text-center shadow-sm"><h2 className="text-xl font-black text-slate-950">No pending quotes</h2><p className="mt-2 text-slate-600">Complete a customer scan or run the demo seed script to populate this queue.</p></section> : <section className="mt-8 overflow-hidden rounded-3xl bg-white shadow-sm"><div className="hidden grid-cols-[1.2fr_.6fr_.6fr_1fr_auto] gap-4 border-b border-slate-200 px-5 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 md:grid"><span>Quote</span><span>Rooms</span><span>Items</span><span>Estimate range</span><span /></div>{quotes.map((quote) => <Link key={quote.id} href={`/agent/${quote.id}`} className="grid gap-2 border-b border-slate-100 px-5 py-5 transition hover:bg-cyan-50 md:grid-cols-[1.2fr_.6fr_.6fr_1fr_auto] md:items-center"><span><strong className="block text-slate-900">{quote.sessionId.slice(0, 8)}</strong><small className="text-slate-500">{quote.createdAt ? new Date(quote.createdAt).toLocaleString() : 'Just now'}</small></span><span className="text-sm text-slate-700">{quote.roomCount} rooms</span><span className="text-sm text-slate-700">{quote.itemCount} items</span><strong className="text-slate-900">{formatCents(quote.breakdown.lowCents)} – {formatCents(quote.breakdown.highCents)}</strong><span className="font-bold text-cyan-700">Review →</span></Link>)}</section>}</div></main>;
}
