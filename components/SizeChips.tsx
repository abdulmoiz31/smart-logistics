'use client';

import type { SizeClass } from '@/lib/types';

interface SizeChipsProps {
  value: SizeClass;
  onChange: (value: SizeClass) => void;
  variant?: 'customer' | 'agent';
}

const options: Array<{ value: SizeClass; label: string; helper: string }> = [
  { value: 's', label: 'Small', helper: 'Smaller than usual' },
  { value: 'm', label: 'Medium', helper: 'Typical' },
  { value: 'l', label: 'Large', helper: 'Larger than usual' },
];

export function SizeChips({ value, onChange, variant = 'customer' }: SizeChipsProps) {
  const isAgent = variant === 'agent';

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]'));
    const index = buttons.findIndex((button) => button === document.activeElement);
    let nextIndex = index;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % buttons.length;
      event.preventDefault();
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + buttons.length) % buttons.length;
      event.preventDefault();
    }
    if (nextIndex !== index && nextIndex >= 0) {
      onChange(options[nextIndex].value);
      buttons[nextIndex]?.focus();
    }
  }

  return (
    <div
      className="grid grid-cols-3 gap-1.5"
      role="radiogroup"
      aria-label="Item size"
      onKeyDown={handleKeyDown}
    >
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            type="button"
            key={option.value}
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={`min-h-11 rounded-lg border px-2 text-left text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-accent ${
              selected
                ? `border-c-accent ${isAgent ? 'bg-c-accent/20 text-c-accent' : 'bg-c-accent/10 text-c-accent'}`
                : `${isAgent ? 'border-c-border bg-c-panel text-c-ink-2 hover:border-c-border-hi' : 'border-u-border bg-u-panel text-u-ink-2 hover:border-u-border/80'}`
            }`}
          >
            <span className="block">{option.label}</span>
            <span className="block text-[10px] font-normal opacity-75">{option.helper}</span>
          </button>
        );
      })}
    </div>
  );
}
