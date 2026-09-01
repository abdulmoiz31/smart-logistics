'use client';

import type { SizeClass } from '@/lib/types';

interface SizeChipsProps {
  value: SizeClass;
  onChange: (value: SizeClass) => void;
}

const options: Array<{ value: SizeClass; label: string; helper: string }> = [
  { value: 's', label: 'Small', helper: 'Smaller than usual' },
  { value: 'm', label: 'Medium', helper: 'Typical' },
  { value: 'l', label: 'Large', helper: 'Larger than usual' },
];

export function SizeChips({ value, onChange }: SizeChipsProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="Item size">
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`min-h-11 rounded-lg border px-2 text-left text-xs font-semibold transition ${
            value === option.value
              ? 'border-cyan-600 bg-cyan-50 text-cyan-800'
              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
          }`}
          aria-pressed={value === option.value}
        >
          <span className="block">{option.label}</span>
          <span className="block text-[10px] font-normal opacity-75">{option.helper}</span>
        </button>
      ))}
    </div>
  );
}
