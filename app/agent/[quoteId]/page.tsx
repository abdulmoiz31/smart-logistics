'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ItemRow } from '@/components/ItemRow';
import { formatCents, priceQuote } from '@/lib/pricing';
import rateCard from '@/data/ratecard.json';
import type { AccessFlag, Item, Quote, RateCard, Room } from '@/lib/types';

type AgentRoom = Room & { captureUrls: string[] };

export default function AgentQuotePage() {
  const { quoteId } = useParams<{ quoteId: string }>();
  const [quote, setQuote] = useState<Quote>();
  const [rooms, setRooms] = useState<AgentRoom[]>([]);
  const [confirmCents, setConfirmCents] = useState(0);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyItemId, setBusyItemId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/agent/quote/${quoteId}`);
        const data = await response.json() as { quote?: Quote; rooms?: AgentRoom[]; error?: string };
        if (!response.ok || !data.quote || !data.rooms) throw new Error(data.error ?? 'Unable to load this quote.');
        setQuote(data.quote);
        setRooms(data.rooms);
        setConfirmCents(data.quote.confirmedCents ?? data.quote.breakdown.subtotalCents);
        setNotes(data.quote.agentNotes ?? '');
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load this quote.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [quoteId]);

  const liveBreakdown = useMemo(() => priceQuote(
    rooms.flatMap((room) => room.items),
    [...new Set(rooms.flatMap((room) => room.accessFlags))] as AccessFlag[],
    rateCard as RateCard,
  ), [rooms]);
  const allItems = rooms.flatMap((room) => room.items);
  const editRate = allItems.length ? Math.round((allItems.filter((item) => item.editedByUser).length / allItems.length) * 100) : 0;
  const outsideRange = confirmCents < liveBreakdown.lowCents || confirmCents > liveBreakdown.highCents;

  function replaceItem(nextItem: Item) {
    setRooms((current) => current.map((room) => room.id === nextItem.roomId
      ? { ...room, items: room.items.map((item) => item.id === nextItem.id ? nextItem : item) }
      : room));
  }

  async function updateItem(item: Item, patch: Partial<Item>) {
    setBusyItemId(item.id);
    setError('');
    try {
      const response = await fetch(`/api/item/${item.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await response.json() as { item?: Item; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? 'Unable to update this item.');
      replaceItem(data.item);
      setConfirmCents(priceQuote(
        rooms.flatMap((room) => room.id === data.item!.roomId
          ? room.items.map((entry) => entry.id === data.item!.id ? data.item! : entry)
          : room.items),
        [...new Set(rooms.flatMap((room) => room.accessFlags))] as AccessFlag[],
        rateCard as RateCard,
      ).subtotalCents);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this item.');
    } finally {
      setBusyItemId('');
    }
  }

  async function confirm() {
    if (!Number.isInteger(confirmCents) || confirmCents <= 0) {
      setError('Enter a positive price before confirming.');
      return;
    }
    setConfirming(true);
    setError('');
    try {
      const response = await fetch(`/api/quote/${quoteId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cents: confirmCents, notes }),
      });
      const data = await response.json() as { quote?: Quote; error?: string };
      if (!response.ok || !data.quote) throw new Error(data.error ?? 'Unable to confirm this quote.');
      setQuote(data.quote);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to confirm this quote.');
    } finally {
      setConfirming(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6 text-slate-600">Loading quote…</main>;
  if (!quote) return <main className="grid min-h-screen place-items-center bg-slate-100 p-6"><p className="font-semibold text-rose-700">{error || 'This quote no longer exists.'}</p></main>;
  const isConfirmed = quote.status === 'confirmed';

  return <main className="min-h-screen bg-slate-100 px-5 py-8"><div className="mx-auto max-w-7xl"><header className="flex items-center justify-between"><div><Link href="/agent" className="text-sm font-bold text-cyan-700">← Quote queue</Link><h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Quote {quote.sessionId.slice(0, 8)}</h1></div><span className={`rounded-full px-3 py-1 text-sm font-bold ${isConfirmed ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{isConfirmed ? 'Confirmed' : 'Pending review'}</span></header>{error && <p role="alert" className="mt-5 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-700">{error}</p>}<div className="mt-7 grid gap-6 lg:grid-cols-[1fr_22rem]"><section className="space-y-6">{rooms.map((room) => <article key={room.id} className="rounded-3xl bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="text-lg font-black capitalize text-slate-950">{room.roomType.replace('_', ' ')}</h2><span className="text-sm text-slate-500">{room.items.length} items</span></div>{room.captureUrls.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto">{room.captureUrls.map((url, index) => <img key={url} src={url} alt={`${room.roomType} capture ${index + 1}`} className="h-20 w-20 rounded-xl object-cover" />)}</div>}<div className="mt-5 space-y-3">{room.items.map((item) => <ItemRow key={item.id} item={item} busy={busyItemId === item.id || isConfirmed} onChange={(patch) => void updateItem(item, patch)} onRemove={() => undefined} />)}</div></article>)}</section><aside className="h-fit rounded-3xl bg-slate-950 p-5 text-white lg:sticky lg:top-5"><p className="text-sm font-bold uppercase tracking-[0.14em] text-cyan-300">Live estimate</p><p className="mt-3 text-2xl font-black">{formatCents(liveBreakdown.lowCents)} – {formatCents(liveBreakdown.highCents)}</p><p className="mt-1 text-sm text-slate-300">{liveBreakdown.totalCubicFeet} cu ft · {editRate}% agent edit rate</p>{isConfirmed && quote.confirmedCents !== undefined ? <div className="mt-6 rounded-2xl bg-emerald-600 p-4"><p className="text-sm font-bold text-emerald-100">Confirmed price</p><p className="mt-1 text-2xl font-black">{formatCents(quote.confirmedCents)}</p></div> : <div className="mt-6 space-y-4"><label className="block text-sm font-bold">Confirm at<input type="number" min="0" step="1" value={Number.isFinite(confirmCents) ? (confirmCents / 100).toFixed(0) : ''} onChange={(event) => setConfirmCents(Math.round(Number(event.target.value) * 100))} className="mt-2 min-h-11 w-full rounded-xl border border-slate-600 bg-slate-900 px-3 text-lg text-white" /></label>{outsideRange && <p className="rounded-xl bg-amber-400/15 p-3 text-sm font-semibold text-amber-200">Outside the range shown to the customer.</p>}<label className="block text-sm font-bold">Agent notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border border-slate-600 bg-slate-900 p-3 text-white" /></label><button type="button" onClick={() => void confirm()} disabled={confirming} className="min-h-12 w-full rounded-xl bg-cyan-400 font-black text-slate-950 disabled:opacity-60">{confirming ? 'Confirming…' : `Confirm at ${formatCents(confirmCents)}`}</button></div>}</aside></div></div></main>;
}
