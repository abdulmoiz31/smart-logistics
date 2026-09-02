'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ItemRow } from '@/components/ItemRow';
import { AuditTrail } from '@/components/AuditTrail';
import { ConsoleShell } from '@/components/agent/console';
import { Lightbox } from '@/components/agent/Lightbox';
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
  const [lightbox, setLightbox] = useState<{ roomId: string; urls: string[]; index: number; label: string } | null>(null);

  const loadQuote = useCallback(async (): Promise<{ quote: Quote; rooms: AgentRoom[] }> => {
    const response = await fetch(`/api/agent/quote/${quoteId}`);
    const data = await response.json() as { quote?: Quote; rooms?: AgentRoom[]; error?: string };
    if (!response.ok || !data.quote || !data.rooms) throw new Error(data.error ?? 'Unable to load this quote.');
    return { quote: data.quote, rooms: data.rooms };
  }, [quoteId]);

  useEffect(() => {
    async function load() {
      try {
        const data = await loadQuote();
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
  }, [loadQuote]);

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

  async function refreshCaptureUrls(): Promise<string[]> {
    const data = await loadQuote();
    setRooms(data.rooms);
    if (lightbox) {
      const currentRoom = data.rooms.find((room) => room.id === lightbox.roomId);
      const newUrls = currentRoom?.captureUrls ?? lightbox.urls;
      setLightbox({ ...lightbox, urls: newUrls });
      return newUrls;
    }
    return [];
  }

  function openLightbox(room: AgentRoom, index: number) {
    setLightbox({ roomId: room.id, urls: room.captureUrls, index, label: `${formatRoomType(room.roomType)} photos` });
  }

  if (loading) {
    return (
      <ConsoleShell title="Quote detail" active="detail">
        <p className="py-16 text-center font-mono text-sm text-c-ink-3">Loading quote…</p>
      </ConsoleShell>
    );
  }

  if (!quote) {
    return (
      <ConsoleShell title="Quote detail" active="detail">
        <p className="py-16 text-center font-semibold text-c-overdue">{error || 'This quote no longer exists.'}</p>
      </ConsoleShell>
    );
  }

  const isConfirmed = quote.status === 'confirmed';

  return (
    <ConsoleShell title={`Quote ${quote.sessionId.slice(0, 8)}`} active="detail">
      {lightbox && (
        <Lightbox
          urls={lightbox.urls}
          index={lightbox.index}
          onClose={() => setLightbox(null)}
          onNavigate={(index) => setLightbox({ ...lightbox, index })}
          label={lightbox.label}
          onRefreshUrls={refreshCaptureUrls}
        />
      )}

      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <Link href="/agent" className="text-sm font-bold text-c-accent">← Quote queue</Link>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-c-ink">Quote {quote.sessionId.slice(0, 8)}</h1>
        </div>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${isConfirmed ? 'bg-c-fresh/15 text-c-fresh' : 'bg-c-waiting/15 text-c-waiting'}`}>
          {isConfirmed ? 'Confirmed' : 'Pending review'}
        </span>
      </header>

      {error && (
        <p role="alert" className="mt-5 rounded-xl border border-c-overdue/30 bg-c-overdue/10 p-3 text-sm font-semibold text-c-overdue">
          {error}
        </p>
      )}

      <div className="mt-7 grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-6">
          {rooms.map((room) => (
            <article key={room.id} className="rounded-3xl border border-c-border bg-c-panel p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-black capitalize text-c-ink">{formatRoomType(room.roomType)}</h2>
                <span className="text-sm text-c-ink-3">{room.items.length} items</span>
              </div>

              {room.captureUrls.length > 0 && (
                <div className="mt-4 flex gap-2 overflow-x-auto">
                  {room.captureUrls.map((url, index) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => openLightbox(room, index)}
                      aria-label={`Open photo ${index + 1} of ${room.captureUrls.length} for ${formatRoomType(room.roomType)}`}
                      className="shrink-0 cursor-zoom-in rounded-xl border border-c-border focus:border-c-accent focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-c-accent"
                    >
                      <img
                        src={url}
                        alt={`${formatRoomType(room.roomType)} capture ${index + 1}`}
                        className="h-24 w-32 rounded-xl object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}

              <div className="mt-5 space-y-3">
                {room.items.map((item) => (
                  <div key={item.id}>
                    <ItemRow item={item} busy={busyItemId === item.id || isConfirmed} onChange={(patch) => void updateItem(item, patch)} onRemove={() => undefined} />
                    <AuditTrail item={item} />
                  </div>
                ))}
              </div>
            </article>
          ))}
        </section>

        <aside className="h-fit rounded-3xl border border-c-border bg-c-panel p-5 text-c-ink lg:sticky lg:top-5">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-c-accent">Live estimate</p>
          <p className="mt-3 text-2xl font-black">{formatCents(liveBreakdown.lowCents)} – {formatCents(liveBreakdown.highCents)}</p>
          <p className="mt-1 text-sm text-c-ink-2">{liveBreakdown.totalCubicFeet} cu ft · {editRate}% agent edit rate</p>
          <p className="text-sm text-c-ink-3">{allItems.filter((item) => item.editedByUser).length} of {allItems.length} items adjusted by a human</p>

          {isConfirmed && quote.confirmedCents !== undefined ? (
            <div className="mt-6 rounded-2xl bg-c-fresh/15 p-4">
              <p className="text-sm font-bold text-c-fresh">Confirmed price</p>
              <p className="mt-1 text-2xl font-black text-c-ink">{formatCents(quote.confirmedCents)}</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              <label className="block text-sm font-bold">
                Confirm at
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={Number.isFinite(confirmCents) ? (confirmCents / 100).toFixed(0) : ''}
                  onChange={(event) => setConfirmCents(Math.round(Number(event.target.value) * 100))}
                  className="mt-2 min-h-11 w-full rounded-xl border border-c-border bg-c-panel-2 px-3 text-lg text-c-ink focus:border-c-accent focus:outline-none"
                />
              </label>

              {outsideRange && (
                <p className="rounded-xl bg-c-waiting/15 p-3 text-sm font-semibold text-c-waiting">
                  Outside the range shown to the customer.
                </p>
              )}

              <label className="block text-sm font-bold">
                Agent notes
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  className="mt-2 min-h-24 w-full rounded-xl border border-c-border bg-c-panel-2 p-3 text-c-ink focus:border-c-accent focus:outline-none"
                />
              </label>

              <button
                type="button"
                onClick={() => void confirm()}
                disabled={confirming}
                className="min-h-12 w-full rounded-xl bg-c-accent font-black text-c-accent-ink disabled:opacity-60"
              >
                {confirming ? 'Confirming…' : `Confirm at ${formatCents(confirmCents)}`}
              </button>
            </div>
          )}
        </aside>
      </div>
    </ConsoleShell>
  );
}

function formatRoomType(roomType: Room['roomType']) {
  return roomType.replace('_', ' ');
}
