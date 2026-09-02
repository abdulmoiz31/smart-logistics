'use client';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  variant?: 'customer' | 'agent';
}

export function Stepper({ value, onChange, min = 1, variant = 'customer' }: StepperProps) {
  const isAgent = variant === 'agent';
  return (
    <div className={`inline-flex min-h-11 items-center overflow-hidden rounded-xl border shadow-sm ${isAgent ? 'border-c-border bg-c-panel' : 'border-u-border bg-u-panel'}`}>
      <button
        type="button"
        className={`grid h-11 w-11 place-items-center text-xl transition disabled:opacity-40 ${isAgent ? 'text-c-ink-2 hover:bg-c-panel-2' : 'text-u-ink-2 hover:bg-u-bg'}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <output className={`min-w-9 px-1 text-center text-sm font-bold tabular-nums ${isAgent ? 'text-c-ink' : 'text-u-ink'}`}>{value}</output>
      <button
        type="button"
        className={`grid h-11 w-11 place-items-center text-xl transition ${isAgent ? 'text-c-ink-2 hover:bg-c-panel-2' : 'text-u-ink-2 hover:bg-u-bg'}`}
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
