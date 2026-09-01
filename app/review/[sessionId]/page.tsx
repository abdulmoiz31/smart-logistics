'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ItemRow } from '@/components/ItemRow';
import { SimilarItemPicker } from '@/components/SimilarItemPicker';
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
      const data = await response.json() as { item?: Item; error?: string };
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

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-600">Loading your inventory…</main>;
  if (!session) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><p className="font-semibold text-rose-700">{error || 'This scan could not be found.'}</p></main>;
  if (!entries.length) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="max-w-sm text-center"><h1 className="text-2xl font-black text-slate-950">Add some items first</h1><p className="mt-2 text-slate-600">We need an inventory before we can create an estimate.</p><Link href={`/scan/${sessionId}`} className="mt-5 inline-block rounded-xl bg-cyan-700 px-4 py-3 font-bold text-white">Return to scan</Link></div></main>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-3xl">
        <header className="flex items-center justify-between"><Link href="/" className="text-xl font-black text-slate-950">Move<span className="text-cyan-700">Scan</span></Link><Link href={`/scan/${sessionId}`} className="text-sm font-bold text-cyan-700">Add another room</Link></header>
        <h1 className="mt-8 text-3xl font-black tracking-tight text-slate-950">Check your inventory</h1>
        <p className="mt-2 text-slate-600">We&apos;ve surfaced anything uncertain first. Tap through changes — the estimate updates after review.</p>
        {error && <p role="alert" className="mt-4 rounded-xl bg-rose-50 p-3 text-sm font-semibold text-rose-800">{error}</p>}
        {uncertain.length > 0 && <section className="mt-7"><h2 className="text-lg font-black text-slate-950">We weren&apos;t sure about these</h2><p className="mt-1 text-sm text-slate-600">A quick check helps keep your estimate honest.</p><div className="mt-3 space-y-3">{uncertain.map(({ item }) => <div key={item.id} className="rounded-2xl border border-amber-200 bg-amber-50 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-slate-900">{item.name}</p><p className="mt-1 text-sm text-slate-600">{Math.round(item.confidence * 100)}% confidence</p></div><button type="button" disabled={busyItemId === item.id} onClick={() => void refine(item)} className="min-h-11 rounded-xl bg-amber-500 px-3 text-sm font-bold text-slate-950 disabled:opacity-50">{busyItemId === item.id ? 'Checking…' : 'Check this'}</button></div></div>)}</div></section>}
        <details className="mt-8"><summary className="cursor-pointer text-lg font-black text-slate-950">Looks good</summary><div className="mt-3 space-y-6">{session.rooms.map((room) => { const goodItems = room.items.filter((item) => !uncertainIds.has(item.id)); if (!goodItems.length) return null; return <div key={room.id}><div className="mb-2 flex items-center justify-between"><h3 className="font-bold capitalize text-slate-800">{room.roomType.replace('_', ' ')}</h3><button type="button" onClick={() => setPickerRoom(room)} className="min-h-11 text-sm font-bold text-cyan-700">Add item</button></div><div className="space-y-3">{goodItems.map((item) => <ItemRow key={item.id} item={item} busy={busyItemId === item.id} onChange={(patch) => void updateItem(item, patch)} onRemove={() => void deleteItem(item)} />)}</div></div>; })}</div></details>
        {pickerRoom && <div className="mt-6"><SimilarItemPicker roomType={pickerRoom.roomType} onPick={addItem} onCancel={() => setPickerRoom(undefined)} /></div>}
        <footer className="sticky bottom-0 mt-8 border-t border-slate-200 bg-slate-50/95 py-4 backdrop-blur"><div className="flex items-center justify-between gap-4"><div><p className="text-sm font-semibold text-slate-500">Total volume</p><p className="text-xl font-black text-slate-950">{Math.round(totalCubicFeet * 10) / 10} cu ft</p></div><button type="button" onClick={() => void getEstimate()} disabled={creatingEstimate} className="min-h-12 rounded-2xl bg-cyan-700 px-5 font-bold text-white disabled:opacity-60">{creatingEstimate ? 'Calculating…' : 'Get my estimate'}</button></div></footer>
      </div>
    </main>
  );
}
