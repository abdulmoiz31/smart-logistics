'use client';

import type { AccessFlag } from '@/lib/types';

interface AccessFlagsProps {
  value: AccessFlag[];
  onChange: (value: AccessFlag[]) => void;
}

const options: Array<{ flag: AccessFlag; label: string }> = [
  { flag: 'stairs', label: 'Stairs to reach this room?' },
  { flag: 'elevator', label: 'Elevator needed?' },
  { flag: 'long_carry', label: 'Long walk from the truck?' },
];

export function AccessFlags({ value, onChange }: AccessFlagsProps) {
  function toggle(flag: AccessFlag) {
    onChange(value.includes(flag) ? value.filter((entry) => entry !== flag) : [...value, flag]);
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-semibold text-u-ink">Getting to this room</legend>
      {options.map((option) => {
        const selected = value.includes(option.flag);
        return (
          <button
            type="button"
            key={option.flag}
            onClick={() => toggle(option.flag)}
            aria-pressed={selected}
            className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-accent ${
              selected
                ? 'border-c-accent bg-c-accent/10 text-c-accent'
                : 'border-u-border bg-u-panel text-u-ink-2 hover:border-u-border/80'
            }`}
          >
            {option.label}
            <span className="text-lg" aria-hidden="true">{selected ? '✓' : '+'}</span>
          </button>
        );
      })}
    </fieldset>
  );
}
