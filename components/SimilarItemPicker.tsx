'use client';

import { useMemo, useState } from 'react';
import { suggestForRoom } from '@/lib/catalogue';
import type { RoomType, SizeClass } from '@/lib/types';
import { SizeChips } from './SizeChips';

interface SimilarItemPickerProps {
  roomType: RoomType;
  onPick: (category: string, sizeClass: SizeClass) => void;
  onCancel: () => void;
}

export function SimilarItemPicker({ roomType, onPick, onCancel }: SimilarItemPickerProps) {
  const entries = useMemo(() => suggestForRoom(roomType), [roomType]);
  const [category, setCategory] = useState<string>();
  const [sizeClass, setSizeClass] = useState<SizeClass>('m');
  const selected = entries.find((entry) => entry.category === category);

  return (
    <section className="rounded-2xl border border-cyan-200 bg-cyan-50 p-4" aria-label="Add a missed item">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-slate-950">Add something we missed</h2>
          <p className="mt-1 text-sm text-slate-600">Pick the item that is most similar.</p>
        </div>
        <button type="button" className="min-h-11 px-2 text-sm font-semibold text-slate-600" onClick={onCancel}>Close</button>
      </div>
      <div className="mt-4 max-h-64 overflow-y-auto rounded-xl bg-white p-2">
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.category}
            onClick={() => setCategory(entry.category)}
            className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              category === entry.category ? 'bg-cyan-600 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-slate-800">How large is this {selected.label.toLowerCase()}?</p>
          <SizeChips value={sizeClass} onChange={setSizeClass} />
          <button
            type="button"
            className="min-h-11 w-full rounded-xl bg-cyan-700 px-4 font-semibold text-white transition hover:bg-cyan-800"
            onClick={() => onPick(selected.category, sizeClass)}
          >
            Add item
          </button>
        </div>
      )}
    </section>
  );
}
