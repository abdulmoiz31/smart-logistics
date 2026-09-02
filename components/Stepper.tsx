'use client';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  variant?: 'customer' | 'agent';
  itemName?: string;
}

export function Stepper({ value, onChange, min = 1, variant = 'customer', itemName = 'quantity' }: StepperProps) {
  const isAgent = variant === 'agent';
  return (
    <div className={`inline-flex min-h-11 items-center overflow-hidden rounded-xl border shadow-sm ${isAgent ? 'border-c-border bg-c-panel' : 'border-u-border bg-u-panel'}`}>
      <button
        type="button"
        className={`grid h-11 w-11 place-items-center text-xl transition disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-accent ${isAgent ? 'text-c-ink-2 hover:bg-c-panel-2' : 'text-u-ink-2 hover:bg-u-bg'}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label={`Decrease ${itemName} count`}
      >
        −
      </button>
      <output className={`min-w-9 px-1 text-center text-sm font-bold tabular-nums ${isAgent ? 'text-c-ink' : 'text-u-ink'}`} aria-live="polite">{value}</output>
      <button
        type="button"
        className={`grid h-11 w-11 place-items-center text-xl transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-c-accent ${isAgent ? 'text-c-ink-2 hover:bg-c-panel-2' : 'text-u-ink-2 hover:bg-u-bg'}`}
        onClick={() => onChange(value + 1)}
        aria-label={`Increase ${itemName} count`}
      >
        +
      </button>
    </div>
  );
}
