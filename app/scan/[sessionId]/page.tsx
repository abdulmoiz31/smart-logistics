'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AccessFlags } from '@/components/AccessFlags';
import { SimilarItemPicker } from '@/components/SimilarItemPicker';
import { downscaleImage } from '@/lib/image';
import type { AccessFlag, Item, Room, RoomType, SessionDetails } from '@/lib/types';

const roomTypes: Array<{ value: RoomType; label: string }> = [
  { value: 'other', label: 'Room' },
  { value: 'living_room', label: 'Living room' },
  { value: 'bedroom', label: 'Bedroom' },
  { value: 'kitchen', label: 'Kitchen' },
  { value: 'dining_room', label: 'Dining room' },
  { value: 'office', label: 'Office' },
  { value: 'garage', label: 'Garage' },
  { value: 'basement', label: 'Basement' },
  { value: 'bathroom', label: 'Bathroom' },
  { value: 'other', label: 'Other' },
];

interface LocalPhoto {
  file: File;
  preview: string;
}

export default function ScanPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [room, setRoom] = useState<Room>();
  const [roomType, setRoomType] = useState<RoomType>('other');
  const [accessFlags, setAccessFlags] = useState<AccessFlag[]>([]);
  const [photos, setPhotos] = useState<LocalPhoto[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [analysing, setAnalysing] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [degraded, setDegraded] = useState(false);
  const [error, setError] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  const roomLabel = useMemo(
    () => roomTypes.find((entry) => entry.value === roomType)?.label ?? 'room',
    [roomType],
  );

  const creatingRoomRef = useRef(false);

  const createRoom = useCallback(async () => {
    if (creatingRoomRef.current) return;
    creatingRoomRef.current = true;
    try {
    const response = await fetch('/api/room', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sessionId, roomType: 'other' }),
    });
    const data = await response.json() as { roomId?: string; error?: string };
    if (!response.ok || !data.roomId) throw new Error(data.error ?? 'Unable to add a room.');
    const nextRoom: Room = {
      id: data.roomId,
      sessionId,
      roomType: 'other',
      accessFlags: [],
      items: [],
    };
    setRoom(nextRoom);
    setRoomType('other');
    setAccessFlags([]);
    setPhotos([]);
    setItems([]);
    setDemoMode(false);
    setDegraded(false);
    setPickerOpen(false);
    } finally {
      creatingRoomRef.current = false;
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(`/api/session/${sessionId}`);
        const data = await response.json() as { session?: SessionDetails; error?: string };
        if (!response.ok || !data.session) throw new Error(data.error ?? 'Unable to load your scan.');
        const existing = data.session.rooms.at(-1);
        if (cancelled) return;
        if (existing) {
          setRoom(existing);
          setRoomType(existing.roomType);
          setAccessFlags(existing.accessFlags);
          setItems(existing.items);
        } else {
          await createRoom();
        }
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Unable to load your scan.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [sessionId, createRoom]);

  async function addPhotos(event: ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(event.target.files ?? []);
    const available = Math.max(0, 12 - photos.length);
    const selected = picked.slice(0, available);
    if (picked.length > selected.length) setError('Using your first 12 photos for this room.');
    const prepared = await Promise.all(selected.map(async (file) => {
      try {
        const blob = await downscaleImage(file);
        const resized = new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'room'}.jpg`, { type: 'image/jpeg' });
        return { file: resized, preview: URL.createObjectURL(resized) };
      } catch {
        return { file, preview: URL.createObjectURL(file) };
      }
    }));
    const MAX_TOTAL_BYTES = 3.5 * 1024 * 1024;
    const existingBytes = photos.reduce((sum, p) => sum + p.file.size, 0);
    let budget = MAX_TOTAL_BYTES - existingBytes;
    const trimmed: LocalPhoto[] = [];
    for (const photo of prepared) {
      if (budget - photo.file.size < 0) break;
      budget -= photo.file.size;
      trimmed.push(photo);
    }
    if (trimmed.length < prepared.length) {
      setError('That is a lot of photos — analysing the first batch. You can add more after.');
      prepared.slice(trimmed.length).forEach((p) => URL.revokeObjectURL(p.preview));
    }
    setPhotos((current) => [...current, ...trimmed]);
    event.target.value = '';
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].preview);
      return current.filter((_, itemIndex) => itemIndex !== index);
    });
  }

  async function analyse() {
    if (!room || !photos.length) return;
    if (items.length > 0 && !window.confirm('Re-analysing replaces the changes you made to this room. Continue?')) return;
    setAnalysing(true);
    setError('');
    try {
      await fetch(`/api/room/${room.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ roomType, accessFlags }),
      });
      const formData = new FormData();
      formData.append('roomId', room.id);
      formData.append('roomType', roomType);
      photos.forEach((photo) => formData.append('files', photo.file));
      const response = await fetch('/api/analyze', { method: 'POST', body: formData });
      const data = await response.json() as { items?: Item[]; roomType?: RoomType; demoMode?: boolean; degraded?: boolean; error?: string };
      if (!response.ok || !data.items || !data.roomType) throw new Error(data.error ?? 'Unable to analyse this room.');
      setItems(data.items);
      setRoom((current) => current ? { ...current, roomType: data.roomType!, accessFlags, items: data.items! } : current);
      setRoomType(data.roomType);
      setDemoMode(Boolean(data.demoMode));
      setDegraded(Boolean(data.degraded));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to analyse this room.');
    } finally {
      setAnalysing(false);
    }
  }

  async function addItem(category: string, sizeClass: 's' | 'm' | 'l') {
    if (!room) return;
    const response = await fetch('/api/item', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ roomId: room.id, category, sizeClass }),
    });
    const data = await response.json() as { item?: Item; error?: string };
    if (!response.ok || !data.item) {
      setError(data.error ?? 'Unable to add this item.');
      return;
    }
    setItems((current) => [...current, data.item!]);
    setPickerOpen(false);
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6 text-slate-600">Preparing your scan…</main>;
  if (error && !room) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><div className="max-w-sm text-center"><p className="font-semibold text-rose-700">{error}</p><Link href="/" className="mt-4 inline-block font-bold text-cyan-700">Start again</Link></div></main>;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-2xl">
        <header className="flex items-center justify-between"><Link href="/" className="text-xl font-black text-slate-950">Move<span className="text-cyan-700">Scan</span></Link><span className="text-sm font-semibold text-slate-500">Room-by-room scan</span></header>
        {demoMode && !degraded && <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-900">Demo mode — using sample inventory results.</p>}
        {degraded && !demoMode && <p className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm font-semibold text-blue-900">Using our backup model — results may be less precise.</p>}
        {degraded && demoMode && <p className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-900">We couldn&apos;t reach our AI just now — showing sample results. <button type="button" onClick={() => { setError(''); }} className="font-bold underline">Try again</button></p>}
        <section className="mt-6 rounded-3xl bg-white p-5 shadow-sm sm:p-7">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-cyan-700">Room {items.length ? 'ready' : '1'}</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Show us this room.</h1>
          <p className="mt-2 text-slate-600">Take a few wide photos from different angles. We&apos;ll avoid counting the same thing twice.</p>
          <label className="mt-6 block text-sm font-semibold text-slate-800">What kind of room is this?
            <select value={roomType} onChange={(event) => setRoomType(event.target.value as RoomType)} className="mt-2 min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-slate-900">
              {roomTypes.map((entry, index) => <option key={`${entry.value}-${index}`} value={entry.value}>{entry.label}</option>)}
            </select>
          </label>
          <div className="mt-6"><AccessFlags value={accessFlags} onChange={setAccessFlags} /></div>
          <label className="mt-6 grid min-h-32 cursor-pointer place-items-center rounded-2xl border-2 border-dashed border-cyan-300 bg-cyan-50 p-4 text-center transition hover:bg-cyan-100">
            <span><strong className="block text-slate-900">Add photos</strong><span className="mt-1 block text-sm text-slate-600">Up to 12 photos · camera opens on your phone</span></span>
            <input type="file" accept="image/*" capture="environment" multiple onChange={addPhotos} className="sr-only" />
          </label>
          {photos.length > 0 && <div className="mt-4 flex gap-2 overflow-x-auto pb-1">{photos.map((photo, index) => <div key={photo.preview} className="relative shrink-0"><img src={photo.preview} alt={`Room photo ${index + 1}`} className="h-20 w-20 rounded-xl object-cover" /><button type="button" onClick={() => removePhoto(index)} className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-slate-950 text-sm text-white" aria-label={`Remove photo ${index + 1}`}>×</button></div>)}</div>}
          {error && <p role="alert" className="mt-4 text-sm font-medium text-rose-700">{error}</p>}
          <button type="button" disabled={!photos.length || analysing} onClick={analyse} className="mt-6 min-h-12 w-full rounded-2xl bg-cyan-700 px-5 font-bold text-white transition hover:bg-cyan-800 disabled:cursor-not-allowed disabled:bg-slate-300">
            {analysing ? `Looking at ${photos.length} photo${photos.length === 1 ? '' : 's'} of your ${roomLabel.toLowerCase()}…` : 'Analyse this room'}
          </button>
        </section>
        {items.length > 0 && <section className="mt-5 rounded-3xl border border-emerald-200 bg-emerald-50 p-5"><h2 className="font-bold text-emerald-950">We found {items.length} item{items.length === 1 ? '' : 's'}.</h2><p className="mt-1 text-sm text-emerald-900">You&apos;ll be able to check every item before your estimate.</p><div className="mt-4 grid gap-3 sm:grid-cols-2"><button type="button" onClick={() => void createRoom()} className="min-h-11 rounded-xl border border-emerald-300 bg-white font-semibold text-emerald-900">Add another room</button><Link href={`/review/${sessionId}`} className="grid min-h-11 place-items-center rounded-xl bg-emerald-700 font-semibold text-white">Review my inventory</Link></div></section>}
        {items.length === 0 && !analysing && <section className="mt-5"><button type="button" onClick={() => setPickerOpen(true)} className="min-h-11 font-semibold text-cyan-700">Did we miss something? Add it yourself</button>{pickerOpen && <div className="mt-3"><SimilarItemPicker roomType={roomType} onPick={addItem} onCancel={() => setPickerOpen(false)} /></div>}</section>}
      </div>
    </main>
  );
}
