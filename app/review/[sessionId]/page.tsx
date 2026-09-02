'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ItemRow } from '@/components/ItemRow';
import { SimilarItemPicker } from '@/components/SimilarItemPicker';
import { formatLabel } from '@/lib/format';
import { asQuotaError, type QuotaError } from '@/lib/quota-error';
import type { Item, Room, SessionDetails } from '@/lib/types';

export default function ReviewPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SessionDetails>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyItemId, setBusyItemId] = useState('');
  const [pickerRoom, setPickerRoom] = useState<Room>();
  const [creatingEstimate, setCreatingEstimate] = useState(false);
  const [quotaBlock, setQuotaBlock] = useState<QuotaError | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const response = await fetch(`/api/session/${sessionId}`);
        const data = await response.json() as { session?: SessionDetails; error?: string };
        if (!response.ok || !data.session) throw new Error(data.error ?? 'Unable to load your inventory.');
        setSession(data.session);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to load your inventory.');
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [sessionId]);

  function replaceItem(nextItem: Item) {
    setSession((current) => current && {
      ...current,
      rooms: current.rooms.map((room) => room.id === nextItem.roomId
        ? { ...room, items: room.items.map((item) => item.id === nextItem.id ? nextItem : item) }
        : room),
    });
  }

  function removeItem(itemId: string, roomId: string) {
    setSession((current) => current && {
      ...current,
      rooms: current.rooms.map((room) => room.id === roomId
        ? { ...room, items: room.items.filter((item) => item.id !== itemId) }
        : room),
    });
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to update this item.');
    } finally {
      setBusyItemId('');
    }
  }

  async function deleteItem(item: Item) {
    setBusyItemId(item.id);
    try {
      const response = await fetch(`/api/item/${item.id}`, { method: 'DELETE' });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to remove this item.');
      removeItem(item.id, item.roomId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove this item.');
    } finally {
      setBusyItemId('');
    }
  }

  async function refine(item: Item) {
    setBusyItemId(item.id);
    try {
      const response = await fetch('/api/refine', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ itemId: item.id }),
      });
      const data = await response.json() as { item?: Item; error?: string; code?: string; authenticated?: boolean };
      const quota = asQuotaError(response.status, data);
      if (quota) {
        setQuotaBlock(quota);
        return;
      }
      if (!response.ok || !data.item) throw new Error(data.error ?? 'Unable to check this item.');
      replaceItem(data.item);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to check this item.');
    } finally {
      setBusyItemId('');
    }
  }

  async function addItem(category: string, sizeClass: 's' | 'm' | 'l') {
    if (!pickerRoom) return;
    try {
      const response = await fetch('/api/item', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomId: pickerRoom.id, category, sizeClass }),
      });
      const data = await response.json() as { item?: Item; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? 'Unable to add this item.');
      setSession((current) => current && {
        ...current,
        rooms: current.rooms.map((room) => room.id === pickerRoom.id
          ? { ...room, items: [...room.items, data.item!] }
          : room),
      });
      setPickerRoom(undefined);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to add this item.');
    }
  }

  const entries = useMemo(
    () => session?.rooms.flatMap((room) => room.items.map((item) => ({ room, item }))) ?? [],
    [session],
  );
  const uncertain = entries.filter(({ item }) => item.confidence < 0.7 || item.ambiguousBetween?.length);
  const uncertainIds = new Set(uncertain.map(({ item }) => item.id));
  const totalCubicFeet = entries.reduce((total, { item }) => total + item.cubicFeet * item.count, 0);

  async function getEstimate() {
    setCreatingEstimate(true);
    setError('');
    try {
      const response = await fetch('/api/estimate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Unable to calculate an estimate.');
      router.push(`/estimate/${sessionId}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to calculate an estimate.');
      setCreatingEstimate(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-u-bg p-6 text-u-ink-2">Loading your inventory...</main>;
  if (!session) return <main className="grid min-h-screen place-items-center bg-u-bg p-6"><div className="max-w-sm text-center"><p className="font-semibold text-c-overdue">{error || 'This scan could not be found.'}</p><Link href="/" className="mt-4 inline-block font-bold text-c-accent">Start a new scan</Link></div></main>;
  if (!entries.length) return <main className="grid min-h-screen place-items-center bg-u-bg p-6"><div className="max-w-sm text-center"><h1 className="text-2xl font-black text-u-ink">Add some items first</h1><p className="mt-2 text-u-ink-2">We need an inventory before we can create an estimate.</p><Link href={`/scan/${sessionId}`} className="mt-5 inline-block rounded-xl bg-c-accent px-4 py-3 font-bold text-c-accent-ink">Return to scan</Link></div></main>;

  return (
    <main className="min-h-screen bg-u-bg px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl pb-24">
        <header className="flex items-center justify-between"><Link href="/" className="text-xl font-black text-u-ink">Move<span className="text-c-accent">Scan</span></Link><Link href={`/scan/${sessionId}`} className="text-sm font-bold text-c-accent">Add another room</Link></header>
        <h1 className="mt-8 text-3xl font-black tracking-tight text-u-ink">Check your inventory</h1>
        <p className="mt-2 text-u-ink-2">{uncertain.length ? "We've surfaced anything uncertain first. Tap through changes -- the estimate updates after review." : 'Review the items below, then get your estimate.'}</p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-c-overdue/20 bg-c-overdue/10 p-3 text-sm font-semibold text-c-overdue">{error}</p>}
        {uncertain.length > 0 && <section className="mt-7"><h2 className="text-lg font-black text-u-ink">We weren&apos;t sure about these</h2><p className="mt-1 text-sm text-u-ink-2">A quick check helps keep your estimate honest.</p>
          {quotaBlock && (
            <div className="mt-3 rounded-2xl border border-c-waiting/20 bg-c-waiting/10 p-5">
              {quotaBlock.authenticated ? (
                <div>
                  <p className="font-black text-c-waiting">Daily limit reached (15 checks)</p>
                  <p className="mt-1 text-sm text-u-ink-2">Your allowance resets tomorrow.</p>
                </div>
              ) : (
                <div>
                  <p className="font-black text-c-waiting">You&apos;ve used your 3 free AI checks today.</p>
                  <p className="mt-1 text-sm text-u-ink-2">Create a free account to check 15 items a day. It takes a few seconds.</p>
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                    <Link href={`/signup?next=/review/${sessionId}`} className="grid min-h-11 place-items-center rounded-xl bg-c-waiting px-4 font-bold text-white">Create free account</Link>
                    <Link href={`/login?next=/review/${sessionId}`} className="grid min-h-11 place-items-center font-semibold text-c-waiting">Already have an account? Sign in</Link>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="mt-3 space-y-3">{uncertain.map(({ item }) => <div key={item.id} className="rounded-2xl border border-c-waiting/20 bg-c-waiting/10 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-u-ink">{formatLabel(item.name)}</p><p className="mt-1 text-sm text-u-ink-2"><span className="font-mono tabular-nums">{Math.round(item.confidence * 100)}%</span> confidence</p>{item.uncertaintyReason && <p className="mt-0.5 text-xs text-u-ink-3">{item.uncertaintyReason}</p>}</div><button type="button" disabled={busyItemId === item.id || Boolean(quotaBlock)} onClick={() => void refine(item)} className="min-h-11 rounded-xl bg-c-waiting px-3 text-sm font-bold text-white disabled:opacity-50">{busyItemId === item.id ? 'Checking...' : 'Check this'}</button></div></div>)}</div></section>}
        <section className="mt-8 space-y-5">{session.rooms.map((room) => {
          const confirmedItems = room.items.filter((item) => !uncertainIds.has(item.id));
          const roomCubicFeet = confirmedItems.reduce((total, item) => total + item.cubicFeet * item.count, 0);
          const roomLabel = formatLabel(room.roomType);
          const addButton = <button type="button" onClick={() => setPickerRoom(room)} className="min-h-11 text-sm font-bold text-c-accent">Add item</button>;

          if (!confirmedItems.length) {
            return <div key={room.id} className="rounded-2xl border border-u-border bg-u-panel p-4 shadow-sm"><div className="flex items-center justify-between gap-3"><div><h2 className="font-bold text-u-ink">{roomLabel}</h2><p className="mt-1 text-sm text-u-ink-2">All items for this room are shown above for review.</p></div>{addButton}</div></div>;
          }

          return <details key={room.id} open={session.rooms.length === 1} className="rounded-2xl border border-u-border bg-u-panel p-4 shadow-sm"><summary className="cursor-pointer font-black text-u-ink">{roomLabel} · <span className="font-mono tabular-nums">{confirmedItems.length}</span> confirmed item{confirmedItems.length === 1 ? '' : 's'} · <span className="font-mono tabular-nums">{Math.round(roomCubicFeet * 10) / 10}</span> cu ft</summary><div className="mt-4"><div className="mb-2 flex justify-end">{addButton}</div><div className="space-y-3">{confirmedItems.map((item) => <ItemRow key={item.id} item={item} busy={busyItemId === item.id} onChange={(patch) => void updateItem(item, patch)} onRemove={() => void deleteItem(item)} />)}</div></div></details>;
        })}</section>
        {pickerRoom && <div className="mt-6"><SimilarItemPicker roomType={pickerRoom.roomType} onPick={addItem} onCancel={() => setPickerRoom(undefined)} /></div>}
        <footer className="sticky bottom-0 mt-8 border-t border-u-border bg-u-bg/95 py-4 backdrop-blur"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-u-ink-3">Total volume</p><p className="text-xl font-black text-u-ink"><span className="font-mono tabular-nums">{Math.round(totalCubicFeet * 10) / 10}</span> cu ft</p></div><button type="button" onClick={() => void getEstimate()} disabled={creatingEstimate} className="min-h-12 rounded-2xl bg-c-accent px-5 font-bold text-c-accent-ink disabled:opacity-60">{creatingEstimate ? 'Calculating...' : 'Get my estimate'}</button></div></footer>
      </div>
    </main>
  );
}
