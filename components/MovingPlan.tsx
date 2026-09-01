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
        <p className="text-sm text-slate-500">{volumeContext.comparison}</p>
      )}

      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <h2 className="font-black text-slate-950">What this move needs</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Truck</dt>
            <dd className="font-bold">{plan.truckLabel}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Crew</dt>
            <dd className="font-bold">{plan.crewSize} movers</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-slate-500">Estimated time</dt>
            <dd className="font-bold">{plan.estimatedHours} hours</dd>
          </div>
          {plan.trips > 1 && (
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Trips</dt>
              <dd className="font-bold">{plan.trips}</dd>
            </div>
          )}
        </dl>
      </div>

      {handling.length > 0 && (
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="font-black text-slate-950">Special handling</h2>
          <ul className="mt-4 space-y-3">
            {handling.map((group) => (
              <li key={group.flag} className="flex flex-wrap items-start gap-2 text-sm">
                <HandlingBadge flag={group.flag} />
                <span className="text-slate-600">{group.items.join(', ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {packing.length > 0 && (
        <details className="rounded-2xl bg-white p-5 shadow-sm">
          <summary className="cursor-pointer font-bold text-slate-950">
            Packing materials · {packing.length} items · tap to see the list
          </summary>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            {packing.map((line) => (
              <div key={line.label} className="contents">
                <dt className="text-slate-500">{line.label}</dt>
                <dd className="font-bold">{line.quantity} {line.unit}</dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </section>
  );
}
