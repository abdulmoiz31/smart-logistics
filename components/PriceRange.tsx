import { formatCents } from '@/lib/pricing';

interface PriceRangeProps {
  lowCents: number;
  highCents: number;
  tolerance: number;
}

export function PriceRange({ lowCents, highCents, tolerance }: PriceRangeProps) {
  return (
    <section className="rounded-3xl border border-u-border bg-u-panel p-6 shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-c-accent">Your moving estimate</p>
      <p className="mt-3 text-3xl font-bold tracking-tight text-u-ink sm:text-4xl">
        <span className="font-mono tabular-nums">{formatCents(lowCents)}</span> – <span className="font-mono tabular-nums">{formatCents(highCents)}</span>
      </p>
      <p className="mt-3 text-sm font-medium text-u-ink-2">Confirmed within 2 hours</p>
      <p className="mt-1 text-xs text-u-ink-3">Range reflects a <span className="font-mono tabular-nums">{Math.round(tolerance * 100)}%</span> inventory-confidence allowance.</p>
    </section>
  );
}
