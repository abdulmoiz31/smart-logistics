'use client';

import { useMemo, useState } from 'react';
import { niceTicks, linearScale, linePath } from '@/lib/chart';
import { ChartFrame } from './ChartFrame';

interface TrendPoint {
  date: string;
  scans: number;
  confirmed: number;
}

interface TrendChartProps {
  title: string;
  description?: string;
  data: TrendPoint[];
}

const WIDTH = 600;
const HEIGHT = 260;
const MARGIN = { top: 20, right: 80, bottom: 40, left: 40 };
const PLOT_W = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_H = HEIGHT - MARGIN.top - MARGIN.bottom;

export function TrendChart({ title, description, data }: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { ticks, yScale, xScale, scansPoints, confirmedPoints } = useMemo(() => {
    const maxValue = Math.max(...data.map((d) => Math.max(d.scans, d.confirmed)), 0);
    const ticks = niceTicks(0, maxValue, 4);
    const yMax = ticks[ticks.length - 1] ?? 1;
    const yScale = linearScale(0, yMax, PLOT_H, 0);
    const xScale = linearScale(0, Math.max(1, data.length - 1), 0, PLOT_W);
    const scansPoints = data.map((d, i) => [xScale(i), yScale(d.scans)] as [number, number]);
    const confirmedPoints = data.map((d, i) => [xScale(i), yScale(d.confirmed)] as [number, number]);
    return { ticks, yScale, xScale, scansPoints, confirmedPoints };
  }, [data]);

  if (data.length < 2) {
    return (
      <ChartFrame title={title} description={description} ariaLabel="Trend chart: not enough history yet" table={<p className="text-c-ink-3">No data available.</p>}>
        <p className="py-8 text-center text-sm text-c-ink-3">Not enough history yet — check back after a few more scans.</p>
      </ChartFrame>
    );
  }

  const legend = [
    { label: 'Scans', color: 'var(--viz-1)' },
    { label: 'Confirmed', color: 'var(--viz-2)' },
  ];

  const table = (
    <table className="w-full text-sm">
      <thead className="border-b border-c-border text-left text-c-ink-3">
        <tr>
          <th className="py-2 font-medium">Date</th>
          <th className="py-2 font-medium">Scans</th>
          <th className="py-2 font-medium">Confirmed</th>
        </tr>
      </thead>
      <tbody className="text-c-ink-2">
        {data.map((point) => (
          <tr key={point.date} className="border-b border-c-border/50">
            <td className="py-2">{point.date}</td>
            <td className="py-2">{point.scans}</td>
            <td className="py-2">{point.confirmed}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  const xLabelInterval = Math.max(1, Math.ceil(data.length / 5));

  function handleMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left - MARGIN.left;
    const index = Math.round((x / PLOT_W) * (data.length - 1));
    setHoverIndex(Math.max(0, Math.min(data.length - 1, index)));
  }

  return (
    <ChartFrame title={title} description={description} legend={legend} table={table} ariaLabel={`Trend chart: scans and confirmed quotes over ${data.length} days`}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        onMouseMove={handleMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="var(--viz-surface)" rx={12} />

        <g transform={`translate(${MARGIN.left}, ${MARGIN.top})`}>
          {/* Grid lines */}
          {ticks.map((tick) => {
            const y = yScale(tick);
            return (
              <line
                key={tick}
                x1={0}
                x2={PLOT_W}
                y1={y}
                y2={y}
                stroke="var(--viz-grid)"
                strokeWidth={1}
              />
            );
          })}

          {/* Y axis labels */}
          {ticks.map((tick) => (
            <text
              key={tick}
              x={-8}
              y={yScale(tick)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill="var(--c-ink-3)"
            >
              {tick}
            </text>
          ))}

          {/* X axis ticks and labels */}
          {data.map((point, i) => {
            const x = xScale(i);
            const showLabel = i % xLabelInterval === 0;
            return (
              <g key={point.date} transform={`translate(${x}, ${PLOT_H})`}>
                <line y1={0} y2={6} stroke="var(--viz-grid)" strokeWidth={1} />
                {showLabel && (
                  <text y={18} textAnchor="middle" fontSize={11} fill="var(--c-ink-3)">
                    {point.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}

          {/* Lines */}
          <path d={linePath(scansPoints)} fill="none" stroke="var(--viz-1)" strokeWidth={2} />
          <path d={linePath(confirmedPoints)} fill="none" stroke="var(--viz-2)" strokeWidth={2} />

          {/* End-of-line labels */}
          {scansPoints.length > 0 && (
            <text
              x={scansPoints[scansPoints.length - 1][0] + 8}
              y={scansPoints[scansPoints.length - 1][1]}
              dy="0.32em"
              fontSize={11}
              fontWeight="bold"
              fill="var(--viz-1)"
            >
              Scans
            </text>
          )}
          {confirmedPoints.length > 0 && (
            <text
              x={confirmedPoints[confirmedPoints.length - 1][0] + 8}
              y={confirmedPoints[confirmedPoints.length - 1][1]}
              dy="0.32em"
              fontSize={11}
              fontWeight="bold"
              fill="var(--viz-2)"
            >
              Confirmed
            </text>
          )}

          {/* Hover crosshair and markers */}
          {hoverIndex !== null && (
            <g>
              <line
                x1={xScale(hoverIndex)}
                x2={xScale(hoverIndex)}
                y1={0}
                y2={PLOT_H}
                stroke="var(--c-border-hi)"
                strokeDasharray="4 4"
              />
              <circle cx={xScale(hoverIndex)} cy={yScale(data[hoverIndex].scans)} r={5} fill="var(--viz-surface)" stroke="var(--viz-1)" strokeWidth={2} />
              <circle cx={xScale(hoverIndex)} cy={yScale(data[hoverIndex].confirmed)} r={5} fill="var(--viz-surface)" stroke="var(--viz-2)" strokeWidth={2} />
            </g>
          )}
        </g>
      </svg>

      {hoverIndex !== null && (
        <div className="mt-2 rounded-lg border border-c-border bg-c-panel-2 px-3 py-2 text-xs">
          <p className="font-semibold text-c-ink">{data[hoverIndex].date}</p>
          <p className="text-c-ink-2"><span className="font-bold" style={{ color: 'var(--viz-1)' }}>Scans:</span> {data[hoverIndex].scans}</p>
          <p className="text-c-ink-2"><span className="font-bold" style={{ color: 'var(--viz-2)' }}>Confirmed:</span> {data[hoverIndex].confirmed}</p>
        </div>
      )}
    </ChartFrame>
  );
}
