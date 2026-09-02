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
  variant?: 'customer' | 'agent';
}

export function ItemRow({ item, onChange, onRemove, busy = false, variant = 'customer' }: ItemRowProps) {
  const isAgent = variant === 'agent';
  return (
    <article className={`rounded-2xl border p-4 shadow-sm ${isAgent ? 'border-c-border bg-c-panel' : 'border-u-border bg-u-panel'}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className={`font-semibold ${isAgent ? 'text-c-ink' : 'text-u-ink'}`}>{formatLabel(item.name)}</h3>
          <p className={`mt-0.5 text-sm font-mono tabular-nums ${isAgent ? 'text-c-ink-3' : 'text-u-ink-3'}`}>{item.cubicFeet} cu ft each</p>
          {item.seenInImages?.length ? (
            <p className={`mt-0.5 text-xs ${isAgent ? 'text-c-ink-3' : 'text-u-ink-3'}`}>
              Seen in {item.seenInImages.length === 1 ? 'photo' : 'photos'} {item.seenInImages.join(item.seenInImages.length === 2 ? ' and ' : ', ')} · counted once
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onRemove}
          disabled={busy}
          className="min-h-11 rounded-lg px-2 text-sm font-semibold text-c-overdue transition hover:bg-c-overdue/10 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-overdue"
        >
          Remove
        </button>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-[auto_1fr] sm:items-center">
        <Stepper value={item.count} onChange={(count) => onChange({ count })} variant={variant} itemName={item.name} />
        <SizeChips value={item.sizeClass} onChange={(sizeClass) => onChange({ sizeClass })} variant={variant} />
      </div>
    </article>
  );
}
