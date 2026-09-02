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
    <section className="rounded-2xl border border-c-accent/20 bg-c-accent/10 p-4" aria-label="Add a missed item">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-u-ink">Add something we missed</h2>
          <p className="mt-1 text-sm text-u-ink-2">Pick the item that is most similar.</p>
        </div>
        <button type="button" className="min-h-11 px-2 text-sm font-semibold text-u-ink-2" onClick={onCancel}>Close</button>
      </div>
      <div className="mt-4 max-h-64 overflow-y-auto rounded-xl bg-u-panel p-2">
        {entries.map((entry) => (
          <button
            type="button"
            key={entry.category}
            onClick={() => setCategory(entry.category)}
            className={`block min-h-11 w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
              category === entry.category ? 'bg-c-accent text-c-accent-ink' : 'text-u-ink hover:bg-u-bg'
            }`}
          >
            {entry.label}
          </button>
        ))}
      </div>
      {selected && (
        <div className="mt-4 space-y-3">
          <p className="text-sm font-medium text-u-ink">How large is this {selected.label.toLowerCase()}?</p>
          <SizeChips value={sizeClass} onChange={setSizeClass} />
          <button
            type="button"
            className="min-h-11 w-full rounded-xl bg-c-accent px-4 font-semibold text-c-accent-ink transition hover:opacity-90"
            onClick={() => onPick(selected.category, sizeClass)}
          >
            Add item
          </button>
        </div>
      )}
    </section>
  );
}
