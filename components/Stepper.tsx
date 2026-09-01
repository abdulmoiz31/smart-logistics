'use client';

interface StepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
}

export function Stepper({ value, onChange, min = 1 }: StepperProps) {
  return (
    <div className="inline-flex min-h-11 items-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        className="grid h-11 w-11 place-items-center text-xl text-slate-700 transition hover:bg-slate-100 disabled:text-slate-300"
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        aria-label="Decrease quantity"
      >
        −
      </button>
      <output className="min-w-9 px-1 text-center text-sm font-bold text-slate-900">{value}</output>
      <button
        type="button"
        className="grid h-11 w-11 place-items-center text-xl text-slate-700 transition hover:bg-slate-100"
        onClick={() => onChange(value + 1)}
        aria-label="Increase quantity"
      >
        +
      </button>
    </div>
  );
}
