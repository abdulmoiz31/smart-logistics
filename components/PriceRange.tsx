import { formatCents } from '@/lib/pricing';

interface PriceRangeProps {
  lowCents: number;
  highCents: number;
  tolerance: number;
}

export function PriceRange({ lowCents, highCents, tolerance }: PriceRangeProps) {
  return (
    <section className="rounded-3xl bg-slate-950 p-6 text-white shadow-lg">
      <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-300">Your moving estimate</p>
      <p className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
        {formatCents(lowCents)} – {formatCents(highCents)}
      </p>
      <p className="mt-3 text-sm font-medium text-slate-200">Confirmed within 2 hours</p>
      <p className="mt-1 text-xs text-slate-400">Range reflects a {Math.round(tolerance * 100)}% inventory-confidence allowance.</p>
    </section>
  );
}
