'use client';

import { useState } from 'react';
import { stackLayout } from '@/lib/chart';
import { ChartFrame } from './ChartFrame';

interface CompositionSlice {
  label: string;
  cubicFeet: number;
}

interface CompositionChartProps {
  title: string;
  description?: string;
  slices: CompositionSlice[];
}

const COLORS = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)', 'var(--viz-4)', 'var(--viz-5)'];

export function CompositionChart({ title, description, slices }: CompositionChartProps) {
  const [hovered, setHovered] = useState<number | null>(null);

  const layout = stackLayout(slices.map((s) => s.cubicFeet));
  const total = slices.reduce((sum, s) => sum + s.cubicFeet, 0);

  const table = (
    <table className="w-full text-sm">
      <thead className="border-b border-c-border text-left text-c-ink-3">
        <tr>
          <th className="py-2 font-medium">Category</th>
          <th className="py-2 font-medium">Cubic feet</th>
          <th className="py-2 font-medium">Share</th>
        </tr>
      </thead>
      <tbody className="text-c-ink-2">
        {slices.map((slice, i) => {
          const pct = total ? Math.round((slice.cubicFeet / total) * 100) : 0;
          return (
            <tr key={slice.label} className="border-b border-c-border/50">
              <td className="py-2">
                <span className="mr-2 inline-block size-3 rounded-sm" style={{ backgroundColor: COLORS[i % COLORS.length] }} aria-hidden />
                {slice.label}
              </td>
              <td className="py-2">{slice.cubicFeet}</td>
              <td className="py-2">{pct}%</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  if (total <= 0) {
    return (
      <ChartFrame title={title} description={description} ariaLabel="Composition chart: no volume data" table={<p className="text-c-ink-3">No data available.</p>}>
        <p className="py-8 text-center text-sm text-c-ink-3">No inventory volume to display yet.</p>
      </ChartFrame>
    );
  }

  return (
    <ChartFrame
      title={title}
      description={description}
      legend={slices.map((slice, i) => ({ label: slice.label, color: COLORS[i % COLORS.length] }))}
      table={table}
      ariaLabel={`Composition chart: volume share by ${slices.map((s) => `${s.label}: ${s.cubicFeet} cu ft`).join(', ')}`}
    >
      <div className="space-y-4">
        <div className="flex h-10 w-full overflow-hidden rounded-lg" style={{ gap: 2, backgroundColor: 'var(--viz-surface)' }}>
          {layout.map((segment, i) => {
            const showLabel = segment.percent >= 8;
            return (
              <div
                key={slices[i].label}
                className="relative flex items-center justify-center transition-opacity"
                style={{
                  width: `${segment.percent}%`,
                  backgroundColor: COLORS[i % COLORS.length],
                  opacity: hovered === i ? 0.85 : 1,
                }}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
              >
                {showLabel && (
                  <span className="px-1 text-xs font-bold text-white drop-shadow">
                    {Math.round(segment.percent)}%
                  </span>
                )}
              </div>
            );
          })}
        </div>

        {hovered !== null && (
          <div className="rounded-lg border border-c-border bg-c-panel-2 px-3 py-2 text-xs">
            <p className="font-semibold text-c-ink">{slices[hovered].label}</p>
            <p className="text-c-ink-2">{slices[hovered].cubicFeet} cu ft · {Math.round(layout[hovered].percent)}%</p>
          </div>
        )}
      </div>
    </ChartFrame>
  );
}
