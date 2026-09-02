import { formatQuantity } from '@/lib/moving-plan';
import { HandlingBadge } from './HandlingBadge';
import type { PackingItem, TruckPlan, VolumeContext } from '@/lib/moving-plan';
import type { HandlingFlag } from '@/lib/types';

interface MovingPlanProps {
  plan: TruckPlan;
  packing: PackingItem[];
  handling: { flag: HandlingFlag; items: string[] }[];
  volumeContext: VolumeContext | null;
}

export function MovingPlan({ plan, packing, handling, volumeContext }: MovingPlanProps) {
  return (
    <section className="mt-5 space-y-5">
      {volumeContext && (
        <p className="text-sm text-u-ink-3">
          {volumeContext.comparison} — typically <span className="font-mono tabular-nums">{volumeContext.typicalLow.toLocaleString('en-US')}</span>–<span className="font-mono tabular-nums">{volumeContext.typicalHigh.toLocaleString('en-US')}</span> cu ft.
        </p>
      )}

      <div className="rounded-2xl border border-u-border bg-u-panel p-5 shadow-sm">
        <h2 className="font-black text-u-ink">What this move needs</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-u-ink-3">Truck</dt>
            <dd className="font-bold text-u-ink">{plan.truckLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-u-ink-3">Crew</dt>
            <dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{plan.crewSize}</span> movers</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-u-ink-3">Estimated time</dt>
            <dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{plan.estimatedHours}</span> hours</dd>
          </div>
          {plan.trips > 1 && (
            <div className="flex justify-between gap-4">
              <dt className="text-u-ink-3">Trips</dt>
              <dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{plan.trips}</span></dd>
            </div>
          )}
        </dl>
      </div>

      {handling.length > 0 && (
        <div className="rounded-2xl border border-u-border bg-u-panel p-5 shadow-sm">
          <h2 className="font-black text-u-ink">Special handling</h2>
          {/* One shared grid, not per-row flex: the badge column sizes to the widest
              badge so every row's item list starts at the same x position. */}
          <ul className="mt-4 grid grid-cols-[max-content_1fr] items-baseline gap-x-3 gap-y-2.5 text-sm">
            {handling.map((group) => (
              <li key={group.flag} className="contents">
                <HandlingBadge flag={group.flag} />
                <span className="text-u-ink-2">{group.items.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {packing.length > 0 && (
        <details className="rounded-2xl border border-u-border bg-u-panel p-5 shadow-sm">
          <summary className="cursor-pointer font-bold text-u-ink">
            Packing materials · <span className="font-mono tabular-nums">{packing.length}</span> items · tap to see the list
          </summary>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {packing.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-u-ink-3">{line.label}</dt>
                <dd className="font-bold text-u-ink"><span className="font-mono tabular-nums">{formatQuantity(line.quantity, line.unit)}</span></dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
