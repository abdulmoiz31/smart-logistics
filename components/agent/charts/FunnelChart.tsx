'use client';

import { useState } from 'react';
import { ChartFrame } from './ChartFrame';

interface FunnelStage {
  label: string;
  count: number;
}

interface FunnelChartProps {
  title: string;
  description?: string;
  stages: FunnelStage[];
  totalScans: number;
}

export function FunnelChart({ title, description, stages, totalScans }: FunnelChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const baseColor = 'var(--viz-1)';

  return (
    <ChartFrame
      title={title}
      description={description}
      ariaLabel={`Funnel chart showing ${stages.map((s) => `${s.label}: ${s.count}`).join(', ')}`}
      table={(
        <table className="w-full text-sm">
          <thead className="border-b border-c-border text-left text-c-ink-3">
            <tr>
              <th className="py-2 font-medium">Stage</th>
              <th className="py-2 font-medium">Count</th>
              <th className="py-2 font-medium">% of scans</th>
              <th className="py-2 font-medium">% of previous</th>
            </tr>
          </thead>
          <tbody className="text-c-ink-2">
            {stages.map((stage, i) => {
              const ofTotal = totalScans ? Math.round((stage.count / totalScans) * 100) : 0;
              const ofPrevious = i > 0 && stages[i - 1].count
                ? Math.round((stage.count / stages[i - 1].count) * 100)
                : 100;
              return (
                <tr key={stage.label} className="border-b border-c-border/50">
                  <td className="py-2">{stage.label}</td>
                  <td className="py-2">{stage.count}</td>
                  <td className="py-2">{ofTotal}%</td>
                  <td className="py-2">{ofPrevious}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    >
      <div className="space-y-2">
        {stages.map((stage, index) => {
          const pct = totalScans > 0 ? (stage.count / totalScans) * 100 : 0;
          const prevCount = index > 0 ? stages[index - 1].count : totalScans;
          const prevPct = prevCount > 0 ? Math.round((stage.count / prevCount) * 100) : 0;
          const opacity = 1 - index * 0.22;

          return (
            <div
              key={stage.label}
              className="relative"
              onMouseEnter={() => setHovered(index)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-center gap-4">
                <span className="w-36 shrink-0 text-sm font-medium text-c-ink">{stage.label}</span>
                <div className="relative h-3.5 flex-1 overflow-hidden rounded-r-lg bg-c-panel-2">
                  <div
                    className="h-full rounded-r-lg transition-all"
                    style={{ width: `${pct}%`, backgroundColor: baseColor, opacity }}
                  />
                </div>
                <span className="w-24 shrink-0 text-right text-sm tabular-nums text-c-ink-2">
                  {stage.count} · {Math.round(pct)}%
                </span>
              </div>

              {hovered === index && (
                <div className="absolute left-40 top-5 z-10 rounded-lg border border-c-border bg-c-panel-2 px-3 py-2 text-xs shadow-lg">
                  <p className="font-semibold text-c-ink">{stage.label}</p>
                  <p className="text-c-ink-2">{stage.count} of {totalScans} scans ({Math.round(pct)}%)</p>
                  {index > 0 && <p className="text-c-ink-3">{prevPct}% of previous stage</p>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </ChartFrame>
  );
}
