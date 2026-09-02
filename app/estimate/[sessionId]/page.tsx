'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { PriceRange } from '@/components/PriceRange';
import { MovingPlan } from '@/components/MovingPlan';
import { planTruckAndCrew, planPackingMaterials, describeVolume } from '@/lib/moving-plan';
import { handlingSummary } from '@/lib/catalogue';
import { formatCents } from '@/lib/pricing';
import type { Quote, SessionDetails } from '@/lib/types';
import './print.css';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function EstimatePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [session, setSession] = useState<SessionDetails>();
  const [quote, setQuote] = useState<Quote>();
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const sessionResponse = await fetch(`/api/session/${sessionId}`);
        const sessionData = await sessionResponse.json() as { session?: SessionDetails; error?: string };
        if (!sessionResponse.ok || !sessionData.session) throw new Error(sessionData.error ?? 'Unable to load this estimate.');
        if (!sessionData.session.rooms.some((room) => room.items.length)) {
          window.location.assign(`/scan/${sessionId}`);
          return;
        }
        setSession(sessionData.session);
        setEmail(sessionData.session.customerEmail ?? '');
        setSubmitted(Boolean(sessionData.session.customerEmail));
        if (sessionData.session.latestQuote) {
          setQuote(sessionData.session.latestQuote);
        } else {
          const quoteResponse = await fetch('/api/estimate', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const quoteData = await quoteResponse.json() as { quote?: Quote; error?: string };
          if (!quoteResponse.ok || !quoteData.quote) throw new Error(quoteData.error ?? 'Unable to calculate this estimate.');
          setQuote(quoteData.quote);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load this estimate.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [sessionId]);

  async function submitEmail() {
    if (!emailPattern.test(email)) {
      setError('Enter a valid email address.');
      return;
    }
    setSending(true);
    setError('');
    try {
      const response = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId, email }),
      });
      const data = await response.json() as { quote?: Quote; error?: string };
      if (!response.ok || !data.quote) throw new Error(data.error ?? 'Unable to send your estimate.');
      setQuote(data.quote);
      setSubmitted(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to send your estimate.');
    } finally {
      setSending(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-u-bg p-6 text-u-ink-2">Calculating your estimate…</main>;
  if (!quote) return <main className="grid min-h-screen place-items-center bg-u-bg p-6"><p className="font-semibold text-c-overdue">{error || 'This estimate could not be found.'}</p></main>;

  const { breakdown } = quote;
  const confirmed = quote.status === 'confirmed' && quote.confirmedCents !== undefined;

  const allItems = session?.rooms.flatMap((room) => room.items) ?? [];
  const allAccessFlags = Array.from(new Set(
    session?.rooms.flatMap((room) => room.accessFlags) ?? [],
  ));
  const truckPlan = planTruckAndCrew(breakdown.totalCubicFeet, allAccessFlags);
  const packing = planPackingMaterials(allItems);
  const handling = handlingSummary(allItems);
  const volumeContext = describeVolume(breakdown.totalCubicFeet);

  return (
    <main className="min-h-screen bg-u-bg px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between"><Link href="/" className="text-xl font-black text-u-ink">Move<span className="text-c-accent">Scan</span></Link><Link href={`/review/${sessionId}`} className="text-sm font-bold text-c-accent">Edit inventory</Link></header>
        <h1 className="mt-8 text-3xl font-black tracking-tight text-u-ink">Your moving estimate</h1>
        <p className="mt-2 text-u-ink-2">Based on <span className="font-mono tabular-nums">{Math.round(breakdown.totalCubicFeet)}</span> cubic feet across your photographed rooms.</p>
        <section className="mt-6">{confirmed ? <div className="rounded-3xl border border-c-fresh/20 bg-c-fresh p-6 text-c-accent-ink"><p className="text-sm font-bold uppercase tracking-[0.16em] text-c-accent-ink/80">Confirmed price</p><p className="mt-3 text-4xl font-black"><span className="font-mono tabular-nums">{formatCents(quote.confirmedCents!)}</span></p><p className="mt-3 text-sm text-c-accent-ink/80">Confirmed by your moving specialist.</p></div> : <PriceRange lowCents={breakdown.lowCents} highCents={breakdown.highCents} tolerance={breakdown.tolerance} />}</section>
        <section className="mt-5 rounded-2xl border border-u-border bg-u-panel p-5 shadow-sm"><h2 className="font-black text-u-ink">Estimate details</h2><dl className="mt-4 space-y-3 text-sm"><div className="flex justify-between gap-4"><dt className="text-u-ink-3">Volume</dt><dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{breakdown.totalCubicFeet}</span> cu ft</dd></div><div className="flex justify-between gap-4"><dt className="text-u-ink-3">Base moving cost</dt><dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{formatCents(breakdown.baseCents)}</span></dd></div><div className="flex justify-between gap-4"><dt className="text-u-ink-3">Crew labor</dt><dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{formatCents(breakdown.laborCents)}</span></dd></div><div className="flex justify-between gap-4"><dt className="text-u-ink-3">Access adders</dt><dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{formatCents(breakdown.accessCents)}</span></dd></div></dl></section>
        <MovingPlan plan={truckPlan} packing={packing} handling={handling} volumeContext={volumeContext} />
        {!confirmed && <section className="mt-5 rounded-2xl border border-c-accent/20 bg-c-accent/10 p-5"><h2 className="font-black text-u-ink">Save your estimate</h2>{submitted ? <p className="mt-2 text-u-ink-2">Your estimate is saved. A mover will confirm your price within 2 hours.</p> : <><p className="mt-2 text-sm text-u-ink-2">Your email helps a mover coordinate your confirmation.</p><div className="mt-4 flex flex-col gap-3 sm:flex-row"><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" className="min-h-11 flex-1 rounded-xl border border-u-border bg-u-bg px-3 text-u-ink" /><button type="button" onClick={() => void submitEmail()} disabled={sending} className="min-h-11 rounded-xl bg-c-accent px-4 font-bold text-c-accent-ink disabled:opacity-60">{sending ? 'Saving...' : 'Save my estimate'}</button></div></>}</section>}
        {error && <p role="alert" className="mt-4 text-sm font-semibold text-c-overdue">{error}</p>}
        <div className="mt-6 text-center"><button type="button" onClick={() => window.print()} className="min-h-11 rounded-xl border border-u-border bg-u-panel px-4 text-sm font-bold text-u-ink-2 hover:bg-u-bg">Print or save as PDF</button></div>
        <p className="mt-6 text-center text-sm leading-6 text-u-ink-3">This is an estimate based on your photos. Your final price is confirmed by a moving specialist.</p>
        {session?.customerEmail && <p className="mt-2 text-center text-xs text-u-ink-3">Estimate requested for {session.customerEmail}</p>}
      </div>
    </main>
  );
}
