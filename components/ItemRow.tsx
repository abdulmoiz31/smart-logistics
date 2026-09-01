'use client';

import { formatLabel } from '@/lib/format';
import type { Item } from '@/lib/types';
import { SizeChips } from './SizeChips';
import { Stepper } from './Stepper';

interface ItemRowProps {
  item: Item;
  onChange: (patch: Partial<Item>) => void;
  onRemove: () => void;
  busy?: boolean;
}

export function ItemRow({ item, onChange, onRemove, busy = false }: ItemRowProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-slate-900">{formatLabel(item.name)}</h3>
          <p className="mt-0.5 text-sm text-slate-500">{item.cubicFeet} cu ft each</p>
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
        >
          Remove
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <Stepper value={item.count} onChange={(count) => onChange({ count })} />
        <SizeChips value={item.sizeClass} onChange={(sizeClass) => onChange({ sizeClass })} />
      </div>
    </article>
  );
}
