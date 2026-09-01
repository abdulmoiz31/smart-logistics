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
      <legend className="text-sm font-semibold text-slate-800">Getting to this room</legend>
      {options.map((option) => (
        <button
          type="button"
          key={option.flag}
          onClick={() => toggle(option.flag)}
          aria-pressed={value.includes(option.flag)}
          className={`flex min-h-11 w-full items-center justify-between rounded-xl border px-3 text-left text-sm font-medium transition ${
            value.includes(option.flag)
              ? 'border-cyan-600 bg-cyan-50 text-cyan-900'
              : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
          }`}
        >
          {option.label}
          <span className="text-lg" aria-hidden="true">{value.includes(option.flag) ? '✓' : '+'}</span>
        </button>
      ))}
    </fieldset>
  );
}
